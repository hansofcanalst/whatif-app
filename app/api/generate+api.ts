// Local dev API route for image generation.
//
// This is a temporary stand-in for the Firebase Cloud Function in
// `functions/src/generate.ts`. It runs server-side in the Expo dev server,
// so `process.env.GEMINI_API_KEY` stays out of the client bundle.
//
// Compared to the real Cloud Function, this route SKIPS:
//   - Firebase Admin ID-token verification
//   - Firestore quota + rate-limit enforcement
//   - Cloud Storage upload (we return base64 data URIs inline)
//
// That makes it unsuitable for production but perfect for iterating on
// prompts/UX without deploying Functions. Swap back by setting
// EXPO_PUBLIC_CLOUD_FUNCTIONS_URL once Functions are deployed — the
// client in `lib/gemini.ts` prefers that URL when present.
//
// IMPORTANT: Do NOT import anything from `lib/firebase.ts` or anything
// that pulls in React Native modules. This file is server-only.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPrompt, buildScopedPrompt } from '@/lib/prompts';
import { composePrompt } from '@/lib/composePrompt';

// Image edit/generation model. Overridable via .env so we can try newer
// previews (e.g. gemini-3.1-flash-image-preview) without a code change.
// To see what your key has access to:
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
const MODEL_ID = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

interface GenerateBody {
  imageBase64: string;
  category: string;
  subcategoryIds: string[];
  // Optional people-scoping (from the detection step). When present and
  // the image has multiple people, we wrap each subcategory prompt with
  // a "only transform these people" preamble. Omitted / empty means
  // transform the whole image (original behavior).
  selectedPeopleLabels?: string[];
  totalPeopleInImage?: number;
}

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY missing on the server. Add it to .env (no EXPO_PUBLIC_ prefix — keep it server-only) and restart `npx expo start`.',
    );
  }
  return new GoogleGenerativeAI(key);
}

async function generateOne(imageBase64: string, prompt: string): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_ID });
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
    { text: prompt },
  ]);

  const candidate = result.response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  // Diagnostic: log what came back even on the success path. The image
  // model sometimes silently returns the original image (or a near-copy)
  // when it declines to make an edit — comparing byte sizes + first/last
  // bytes catches that, which the old "throw on missing image" path
  // couldn't.
  const finishReasonOk = candidate?.finishReason;
  const textOnSuccess = parts.find((p: any) => typeof p?.text === 'string')?.text;
  const inlinePart = parts.find((p: any) => p?.inlineData?.data);
  if (inlinePart) {
    const outB64 = (inlinePart as any).inlineData.data as string;
    const sameLength = outB64.length === imageBase64.length;
    const samePrefix = outB64.slice(0, 64) === imageBase64.slice(0, 64);
    console.log(
      '[api/generate] ◆ Nano Banana response:',
      JSON.stringify({
        finishReason: finishReasonOk,
        inBytes: imageBase64.length,
        outBytes: outB64.length,
        sameLength,
        samePrefix,
        looksEchoed: sameLength && samePrefix,
        textAlongside: textOnSuccess ? String(textOnSuccess).slice(0, 200) : null,
      }),
    );
    return outB64;
  }

  // No image in response — diagnose why. Common causes:
  //   - Safety filters (finishReason: 'SAFETY' or 'IMAGE_SAFETY')
  //   - Prompt blocked (promptFeedback.blockReason)
  //   - Model returned text only (finishReason: 'STOP' but no inlineData)
  const finishReason = candidate?.finishReason;
  const textPart = parts.find((p: any) => typeof p?.text === 'string')?.text;
  const blockReason = (result.response as any).promptFeedback?.blockReason;

  const detail =
    blockReason
      ? `prompt blocked: ${blockReason}`
      : finishReason && finishReason !== 'STOP'
      ? `finishReason: ${finishReason}`
      : textPart
      ? `model returned text only: "${String(textPart).slice(0, 200)}"`
      : 'model returned no image parts';

  throw new Error(detail);
}

export async function POST(request: Request): Promise<Response> {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!body?.imageBase64 || !body?.category || !Array.isArray(body.subcategoryIds)) {
    return new Response('Invalid body: require { imageBase64, category, subcategoryIds }', { status: 400 });
  }
  if (body.subcategoryIds.length === 0) {
    return new Response('No subcategories selected', { status: 400 });
  }
  if (body.subcategoryIds.length > 6) {
    return new Response('Too many subcategories (max 6)', { status: 400 });
  }

  try {
    const generationId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const results: Array<{ imageURL: string; prompt: string; label: string; subcategoryId: string }> = [];
    const failures: Array<{ subId: string; reason: string }> = [];

    for (const subId of body.subcategoryIds) {
      const meta = getPrompt(body.category, subId);
      if (!meta) {
        const reason = `unknown subcategory ${body.category}/${subId}`;
        console.warn(`[api/generate] ${reason}`);
        failures.push({ subId, reason });
        continue;
      }
      try {
        // Two-stage pipeline for multi-person photos:
        //   1. Compose a rich, per-person enumerated prompt by showing
        //      Gemini Flash the image + the transformation intent.
        //   2. Hand that composed prompt to Nano Banana.
        //
        // For solo subjects (or when detection didn't run) we skip stage 1
        // — the static prompt is fine and we avoid the latency/cost.
        const isMultiPerson = (body.totalPeopleInImage ?? 0) > 1;
        let finalPrompt: string;
        let promptSource: 'composed' | 'composed-fallback' | 'static';
        if (isMultiPerson) {
          try {
            finalPrompt = await composePrompt({
              imageBase64: body.imageBase64,
              transformation: meta.prompt,
              selectedPeopleLabels: body.selectedPeopleLabels,
              totalPeopleInImage: body.totalPeopleInImage,
            });
            promptSource = 'composed';
          } catch (composeErr) {
            // Fall back to the static scoped prompt so the user still
            // gets a result — degraded, but not broken.
            console.warn('[api/generate] composer failed, falling back to static prompt:', composeErr);
            finalPrompt = buildScopedPrompt(
              meta.prompt,
              body.selectedPeopleLabels,
              body.totalPeopleInImage,
            );
            promptSource = 'composed-fallback';
          }
        } else {
          finalPrompt = buildScopedPrompt(
            meta.prompt,
            body.selectedPeopleLabels,
            body.totalPeopleInImage,
          );
          promptSource = 'static';
        }
        console.log('[api/generate] ▼▼▼ PROMPT SENT TO NANO BANANA ▼▼▼');
        console.log('[api/generate] subId:', subId, '| source:', promptSource, '| total:', body.totalPeopleInImage, '| selected:', body.selectedPeopleLabels);
        console.log(finalPrompt);
        console.log('[api/generate] ▲▲▲ END PROMPT ▲▲▲');
        const resultB64 = await generateOne(body.imageBase64, finalPrompt);
        // Return a data URI so the client <Image> can render it without
        // needing Cloud Storage. Large but fine for dev.
        const imageURL = `data:image/jpeg;base64,${resultB64}`;
        // Store the base (unwrapped) prompt so the gallery/history shows
        // the user what transformation they asked for, not the scoping boilerplate.
        results.push({ imageURL, prompt: meta.prompt, label: meta.label, subcategoryId: subId });
      } catch (err: any) {
        const reason = err?.message ?? String(err);
        console.warn(`[api/generate] ${subId} failed:`, err);
        failures.push({ subId, reason });
      }
    }

    if (results.length === 0) {
      // Surface the actual reason(s) so the client can display something
      // useful. The generic "try a different photo" message is useless for
      // debugging config/model errors.
      const detail = failures.map((f) => `${f.subId}: ${f.reason}`).join(' | ') || 'no results';
      return new Response(`All variations failed — ${detail}`, { status: 500 });
    }

    return Response.json({ generationId, results });
  } catch (e: any) {
    console.error('[api/generate] error', e);
    return new Response(e?.message ?? 'Internal error', { status: 500 });
  }
}
