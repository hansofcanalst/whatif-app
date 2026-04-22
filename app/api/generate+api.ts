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
import { getPrompt } from '@/lib/prompts';

// Image edit/generation model. Overridable via .env so we can try newer
// previews (e.g. gemini-3.1-flash-image-preview) without a code change.
// To see what your key has access to:
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
const MODEL_ID = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

interface GenerateBody {
  imageBase64: string;
  category: string;
  subcategoryIds: string[];
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

  for (const part of parts) {
    const inline = (part as any).inlineData;
    if (inline?.data) return inline.data as string;
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
        const resultB64 = await generateOne(body.imageBase64, meta.prompt);
        // Return a data URI so the client <Image> can render it without
        // needing Cloud Storage. Large but fine for dev.
        const imageURL = `data:image/jpeg;base64,${resultB64}`;
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
