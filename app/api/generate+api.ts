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

// Defense against oversize uploads. The client resizes to 1024px JPEG at
// q=0.8 (see useImagePicker.ts + constants/config.ts), which produces
// ~500KB–1MB base64 payloads in practice. 12MB (base64 chars ≈ bytes) is
// ~9MB of binary image data — well above any legitimate client payload
// but safely under the Firebase Functions HTTP body limit (10MB decoded).
// A malformed or malicious client sending a multi-megapixel uncompressed
// paste would OOM the dev server without this check.
const MAX_IMAGE_BASE64_BYTES = 12 * 1024 * 1024;

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
  // Client-forwarded moderation flag — the detect step flagged at least
  // one person as under 18. The dev route can't write Firestore, but we
  // log every request here so stdout captures the audit trail during
  // local testing. Prod mirror lives in functions/src/generate.ts.
  containsMinor?: boolean;
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

// Retry the transient Google failures (429 rate-limit, 5xx, brief network
// blips) with bounded exponential backoff. Non-retryable failures — prompt
// blocks, safety finish reasons, "model returned no image" — throw on the
// first attempt so we surface the actual cause quickly instead of sitting
// in a backoff loop. Matches the policy in lib/composePrompt.ts and
// app/api/detect+api.ts so every Gemini call in the pipeline behaves the
// same way.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_GENERATE_ATTEMPTS = 3;

async function callModelWithRetry(
  imageBase64: string,
  prompt: string,
): Promise<{ result: any; attempt: number }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_ID });
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent([
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        { text: prompt },
      ]);
      return { result, attempt };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const retryable = status != null && RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt === MAX_GENERATE_ATTEMPTS) throw err;
      const delay = 500 * attempt + Math.floor(Math.random() * 250);
      console.warn(
        `[api/generate] image-gen attempt ${attempt} failed (${status}); retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable — the loop either returns or throws.
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function generateOne(imageBase64: string, prompt: string): Promise<string> {
  console.log(`[api/generate] → image model: ${MODEL_ID}`);
  const { result, attempt } = await callModelWithRetry(imageBase64, prompt);
  if (attempt > 1) console.log(`[api/generate] image-gen succeeded on attempt ${attempt}`);

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
  if (body.imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
    const sizeMB = (body.imageBase64.length / 1024 / 1024).toFixed(1);
    const limitMB = (MAX_IMAGE_BASE64_BYTES / 1024 / 1024).toFixed(0);
    return new Response(
      `Image too large (${sizeMB}MB encoded, limit ${limitMB}MB). Pick a smaller photo — the app normally resizes for you, so this usually means something went wrong with the picker.`,
      { status: 413 },
    );
  }
  if (body.subcategoryIds.length === 0) {
    return new Response('No subcategories selected', { status: 400 });
  }
  if (body.subcategoryIds.length > 6) {
    return new Response('Too many subcategories (max 6)', { status: 400 });
  }

  const generationId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  // Dev-only audit line. In prod the Cloud Function writes a structured
  // entry to the moderation_log Firestore collection; here we just
  // emit to stdout so a tailing dev can see the same fields.
  console.log(
    '[api/generate] moderation_log',
    JSON.stringify({
      generationId,
      categoryId: body.category,
      subcategoryIds: body.subcategoryIds,
      totalPeopleInImage: body.totalPeopleInImage ?? null,
      selectedPeopleCount: body.selectedPeopleLabels?.length ?? null,
      containsMinor: body.containsMinor ?? null,
      source: 'local-dev',
      timestamp: new Date().toISOString(),
    }),
  );

  // NDJSON streaming: one {type, ...} JSON object per line. The client
  // (see lib/gemini.ts streamGeneration) updates per-subcategory tiles
  // as `result` / `error` events arrive, so a 5-variant run starts
  // showing images after ~10s instead of making the user stare at a
  // spinner for 60s. See also the mirror in functions/src/generate.ts.
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const send = (obj: unknown) =>
    writer.write(encoder.encode(JSON.stringify(obj) + '\n'));

  // Drive the generation work in the background. `POST` returns the
  // readable half of the stream immediately so the client can start
  // reading while we run model calls.
  (async () => {
    let completed = 0;
    let failed = 0;
    try {
      await send({ type: 'start', generationId, total: body.subcategoryIds.length });

      for (let i = 0; i < body.subcategoryIds.length; i++) {
        const subId = body.subcategoryIds[i];
        const meta = getPrompt(body.category, subId);
        if (!meta) {
          const reason = `unknown subcategory ${body.category}/${subId}`;
          console.warn(`[api/generate] ${reason}`);
          await send({ type: 'error', index: i, subcategoryId: subId, message: reason });
          failed++;
          continue;
        }
        try {
        // Pipeline branching:
        //
        //  (A) Solo subject (or detection didn't run): single-pass with the
        //      static prompt. Fast and correct — base prompt says "the person",
        //      which matches the scene.
        //
        //  (B) Multi-person, user selected 0 or 1 specific people: single-pass
        //      through the composer. The composer sees the image + intent and
        //      emits a rich, scoped prompt. Good for a targeted subset-of-one
        //      edit (everyone else preserved).
        //
        //  (C) Multi-person, user selected 2+ (including "All"): SEQUENTIAL
        //      per-person passes, chained. For each selected person we run a
        //      scoped composer prompt ("transform only this person; preserve
        //      everyone else") and feed the output into the next pass.
        //
        //      Why sequential: on strong transformations (e.g. the recognizable
        //      Latino race-swap), Nano Banana in a single shot dedicates its
        //      editing budget to the most salient face and silently skips
        //      harder subjects — producing results like "1 of 5 transformed".
        //      Neither meta-prompt variant (v1 unified, v2 enumerated) is
        //      reliable past ~3/5 subjects. Sequential trades latency for
        //      correctness: it turns N "transform all N" calls (one shot) into
        //      N "transform this one, leave the rest alone" calls (serialized),
        //      which Nano Banana handles reliably.
        const total = body.totalPeopleInImage ?? 0;
        const selected = body.selectedPeopleLabels ?? [];
        const isMultiPerson = total > 1;
        const shouldSequence = isMultiPerson && selected.length >= 2;

        let resultB64: string;
        let promptSource: 'composed' | 'composed-fallback' | 'static' | 'sequential';

        if (shouldSequence) {
          // (C) Sequential per-person editing.
          console.log(
            `[api/generate] ▼ sequential mode: ${selected.length} per-person passes for subId=${subId}`,
          );
          let current = body.imageBase64;
          for (let i = 0; i < selected.length; i++) {
            const person = selected[i];
            let personPrompt: string;
            try {
              personPrompt = await composePrompt({
                // Pass the CURRENT (possibly already partially-edited) image so
                // the composer describes the scene as Nano Banana will see it
                // on this pass. This also lets it reference previously-edited
                // subjects as "already transformed, leave them as they are"
                // without us having to say so explicitly.
                imageBase64: current,
                transformation: meta.prompt,
                selectedPeopleLabels: [person],
                totalPeopleInImage: total,
              });
            } catch (composeErr) {
              console.warn(
                `[api/generate] composer failed on pass ${i + 1}/${selected.length}, using static scoped prompt:`,
                composeErr,
              );
              personPrompt = buildScopedPrompt(meta.prompt, [person], total);
            }
            console.log(
              `[api/generate] ▼ pass ${i + 1}/${selected.length} — target: "${person}" — subId: ${subId}`,
            );
            console.log(personPrompt);
            console.log('[api/generate] ▲ end pass prompt');
            current = await generateOne(current, personPrompt);
          }
          resultB64 = current;
          promptSource = 'sequential';
        } else {
          // (A) or (B): single-pass.
          let finalPrompt: string;
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
          console.log('[api/generate] subId:', subId, '| source:', promptSource, '| total:', total, '| selected:', selected);
          console.log(finalPrompt);
          console.log('[api/generate] ▲▲▲ END PROMPT ▲▲▲');
          resultB64 = await generateOne(body.imageBase64, finalPrompt);
        }

        // Return a data URI so the client <Image> can render it without
        // needing Cloud Storage. Large but fine for dev.
        const imageURL = `data:image/jpeg;base64,${resultB64}`;
        console.log(`[api/generate] ✓ subId=${subId} complete — source=${promptSource}`);
        await send({
          type: 'result',
          index: i,
          // Store the base (unwrapped) prompt so the gallery/history shows
          // what the user asked for, not the scoping boilerplate.
          item: { imageURL, prompt: meta.prompt, label: meta.label, subcategoryId: subId },
        });
        completed++;
      } catch (err: any) {
        const reason = err?.message ?? String(err);
        console.warn(`[api/generate] ${subId} failed:`, err);
        await send({ type: 'error', index: i, subcategoryId: subId, message: reason });
        failed++;
      }
      }

      await send({ type: 'done', generationId, completed, failed });
    } catch (e: any) {
      // Fatal = the loop itself threw, not a per-subcategory failure
      // (those are handled inline above). Emit a fatal event so the
      // client can surface it, then close the stream.
      console.error('[api/generate] fatal', e);
      try {
        await send({ type: 'fatal', message: e?.message ?? 'Internal error' });
      } catch {
        /* writer already closed */
      }
    } finally {
      try {
        await writer.close();
      } catch {
        /* already closed */
      }
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      // Defeat proxy/middleware buffering. Expo's dev server shouldn't
      // compress this, but setting no-transform is cheap insurance.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
