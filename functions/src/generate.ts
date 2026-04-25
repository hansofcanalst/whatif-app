import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPrompt, isPremiumCategory, buildScopedPrompt, appendAccessoryPrompt } from './prompts';
import { composePrompt } from './composePrompt';

const FREE_CAP = 3;
// Image edit/generation model. Overridable via env. Keep default in sync
// with app/api/generate+api.ts.
const MODEL_ID = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const RATE_LIMIT_PER_MINUTE = 10;

// Defense against oversize uploads. Keep in sync with app/api/generate+api.ts.
// Client-side compression targets ~500KB–1MB base64; this 12MB cap is a
// sanity ceiling, not a product limit.
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
  // one person as under 18. Written to the moderation_log Firestore
  // collection for audit. The client already hard-blocks premium
  // categories when this is true, so a premium generation reaching this
  // endpoint with containsMinor=true indicates either a client bypass
  // attempt or a detector disagreement between this session and a past
  // one; either way we want it on the record.
  containsMinor?: boolean;
  // Per-subcategory opt-in styling add-ons. Keyed by subcategoryId,
  // value is the list of accessory ids the user ticked client-side.
  // Server resolves to prompt snippets via appendAccessoryPrompt and
  // appends to the base prompt before scoping/branching. See
  // lib/prompts.ts for the framing note (opt-in only, never auto-applied).
  modifiers?: Record<string, string[]>;
}

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(key);
}

async function verifyAuth(req: functions.https.Request): Promise<string> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing bearer token');
  }
  const token = header.substring(7);
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
}

async function checkRateLimit(uid: string): Promise<void> {
  const ref = admin.firestore().collection('rateLimits').doc(uid);
  const now = Date.now();
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { windowStart?: number; count?: number } | undefined;
    const windowStart = data?.windowStart ?? 0;
    const count = data?.count ?? 0;
    if (now - windowStart < 60_000) {
      if (count >= RATE_LIMIT_PER_MINUTE) {
        throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded');
      }
      tx.set(ref, { windowStart, count: count + 1 }, { merge: true });
    } else {
      tx.set(ref, { windowStart: now, count: 1 });
    }
  });
}

async function checkQuotaAndCategory(uid: string, category: string): Promise<void> {
  const userRef = admin.firestore().collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'User not found');
  const user = snap.data() as { freeGenerationsUsed?: number; subscriptionStatus?: string };
  const isPro = user.subscriptionStatus === 'pro';
  if (isPremiumCategory(category) && !isPro) {
    const err: any = new Error('Paywall required: premium category');
    err.status = 402;
    throw err;
  }
  if (!isPro && (user.freeGenerationsUsed ?? 0) >= FREE_CAP) {
    const err: any = new Error('Paywall required: free quota exceeded');
    err.status = 402;
    throw err;
  }
}

// Retry transient Google failures (429 rate-limit, 5xx, brief network
// blips) with bounded exponential backoff. Matches the policy in the local
// /api/generate route, /api/detect, and lib/composePrompt.ts — every
// Gemini call in the pipeline retries the same way. Non-retryable
// failures (prompt blocks, "no image" responses) throw on the first
// attempt so we don't waste a full retry budget on errors that won't
// self-resolve.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_GENERATE_ATTEMPTS = 3;

async function generateOne(
  imageBase64: string,
  prompt: string,
): Promise<{ b64: string; attempts: number }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_ID });
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent([
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        { text: prompt },
      ]);
      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const inline = (part as any).inlineData;
        if (inline?.data) {
          if (attempt > 1) console.log(`[fn/generate] image-gen succeeded on attempt ${attempt}`);
          // Return the attempt count so the caller can report it via the
          // `logs/` telemetry write. Summed across sequential passes.
          return { b64: inline.data as string, attempts: attempt };
        }
      }
      // "No image" is not a transient/retryable condition — the model
      // responded with text or nothing, which means it declined the edit.
      // Surface that immediately rather than burning retries.
      throw new Error('Model returned no image.');
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const retryable = status != null && RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt === MAX_GENERATE_ATTEMPTS) throw err;
      const delay = 500 * attempt + Math.floor(Math.random() * 250);
      console.warn(
        `[fn/generate] image-gen attempt ${attempt} failed (${status}); retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function uploadImage(
  uid: string,
  generationId: string,
  key: string,
  base64: string,
): Promise<string> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(`users/${uid}/generations/${generationId}/${key}.jpg`);
  const buf = Buffer.from(base64, 'base64');
  await file.save(buf, { contentType: 'image/jpeg', public: false });
  const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 365 });
  return url;
}

export const generate = functions
  // 300s accommodates the sequential-per-person path for the worst realistic
  // case: ~5 selected people × ~3 variants × (composer + Nano Banana) per
  // pass. At 120s we would routinely time out on 5-person groups once a user
  // asked for multiple variants. 300s is also the Gen1 max.
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    try {
      const uid = await verifyAuth(req);
      const body = req.body as GenerateBody;
      if (!body?.imageBase64 || !body?.category || !Array.isArray(body.subcategoryIds)) {
        res.status(400).send('Invalid body');
        return;
      }
      if (body.imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
        const sizeMB = (body.imageBase64.length / 1024 / 1024).toFixed(1);
        const limitMB = (MAX_IMAGE_BASE64_BYTES / 1024 / 1024).toFixed(0);
        res
          .status(413)
          .send(
            `Image too large (${sizeMB}MB encoded, limit ${limitMB}MB). Pick a smaller photo.`,
          );
        return;
      }
      if (body.subcategoryIds.length === 0) {
        res.status(400).send('No subcategories selected');
        return;
      }
      if (body.subcategoryIds.length > 6) {
        res.status(400).send('Too many subcategories');
        return;
      }

      await checkRateLimit(uid);

      try {
        await checkQuotaAndCategory(uid, body.category);
      } catch (e: any) {
        if (e?.status === 402) {
          res.status(402).send(e.message);
          return;
        }
        throw e;
      }

      const generationId = admin.firestore().collection('generations').doc().id;
      const genRef = admin.firestore().collection('generations').doc(generationId);

      // Moderation audit log — written before the generation runs so the
      // entry exists even if the model call later errors out. No photos,
      // no labels, no prompt text — just the decision inputs we'd need to
      // reconstruct a specific request for a takedown review: who, what,
      // how many people, whether any were flagged as a minor.
      try {
        await admin
          .firestore()
          .collection('moderation_log')
          .add({
            uid,
            generationId,
            categoryId: body.category,
            subcategoryIds: body.subcategoryIds,
            totalPeopleInImage: body.totalPeopleInImage ?? null,
            selectedPeopleCount: body.selectedPeopleLabels?.length ?? null,
            containsMinor: body.containsMinor ?? null,
            source: 'cloud-function',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
      } catch (e) {
        // Logging failure must not block the user's generation. We still
        // have the `generations/{id}` doc with uid+categoryId as a
        // backstop audit record.
        console.warn('[fn/generate] moderation_log write failed:', e);
      }

      const originalURL = await uploadImage(uid, generationId, 'original', body.imageBase64);

      await genRef.set({
        id: generationId,
        userId: uid,
        categoryId: body.category,
        categoryLabel: body.category,
        originalImageURL: originalURL,
        results: [],
        status: 'processing',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // From this point on we stream NDJSON to the client instead of
      // buffering a single JSON response. The client (lib/gemini.ts
      // streamGeneration) renders each result tile as its `result` event
      // lands — mirrors the local /api/generate route so the UX is
      // identical in both environments.
      //
      // flushHeaders is important on Firebase HTTPS: without it, Gen1
      // buffers the entire body before flushing, which defeats the
      // streaming UX. Setting no-transform also prevents any intermediary
      // compression layer from holding the response until end.
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.status(200);
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }
      const sendEvent = (obj: unknown) =>
        new Promise<void>((resolve) => {
          // res.write in Express returns a bool signaling backpressure.
          // We don't bother awaiting the 'drain' event here because event
          // payloads are small (< 2MB signed URLs) and few (≤6 per run).
          res.write(JSON.stringify(obj) + '\n', () => resolve());
        });

      await sendEvent({ type: 'start', generationId, total: body.subcategoryIds.length });

      const results: Array<{ imageURL: string; prompt: string; label: string; subcategoryId: string }> = [];
      let completedCount = 0;
      let failedCount = 0;
      for (let i = 0; i < body.subcategoryIds.length; i++) {
        const subId = body.subcategoryIds[i];
        // Per-variant telemetry: every settled variant (success or failure)
        // writes one entry to the `logs/` Firestore collection. Admin SDK
        // bypasses rules so the client is never trusted to produce these.
        // Logging failures are swallowed — losing a log row must not
        // break the user's generation.
        const variantStartedAt = Date.now();
        const writeLog = async (entry: Record<string, unknown>) => {
          try {
            await admin
              .firestore()
              .collection('logs')
              .add({
                ...entry,
                generationId,
                userId: uid,
                categoryId: body.category,
                subcategoryId: subId,
                modelId: MODEL_ID,
                source: 'cloud-function',
                durationMs: Date.now() - variantStartedAt,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
          } catch (logErr) {
            console.warn('[fn/generate] logs write failed:', logErr);
          }
        };
        // Hoisted above the try so the catch can report partial progress
        // on failure (e.g. sequential variant that died on pass 4 of 5
        // already committed real work worth reporting).
        let promptSource: 'composed' | 'composed-fallback' | 'static' | 'sequential' | null = null;
        let totalAttempts = 0;
        const meta = getPrompt(body.category, subId);
        if (!meta) {
          const reason = `unknown subcategory ${body.category}/${subId}`;
          console.warn(`[fn/generate] ${reason}`);
          await writeLog({
            status: 'failed',
            errorMessage: reason,
            promptSource: null,
            attempts: 0,
          });
          await sendEvent({ type: 'error', index: i, subcategoryId: subId, message: reason });
          failedCount++;
          continue;
        }
        try {
          // Pipeline branching — see app/api/generate+api.ts for the full
          // rationale (kept in sync):
          //   (A) solo: single-pass static prompt
          //   (B) multi-person, 0–1 selected: single-pass composer
          //   (C) multi-person, 2+ selected: SEQUENTIAL per-person passes
          //       because Nano Banana drops harder subjects in one-shot
          //       multi-person edits when the transformation is strong.
          const total = body.totalPeopleInImage ?? 0;
          const selected = body.selectedPeopleLabels ?? [];
          const isMultiPerson = total > 1;
          const shouldSequence = isMultiPerson && selected.length >= 2;

          // Append optional accessory snippets ONCE at the variant level.
          // See app/api/generate+api.ts for the rationale (kept in sync):
          // every prompt branch carries the same accessory instructions
          // because we splice them into the base prompt before any
          // scoping/composing happens.
          const accessoryIds = body.modifiers?.[subId];
          const accessorySuffix = appendAccessoryPrompt(body.category, subId, accessoryIds);
          const basePrompt = meta.prompt + accessorySuffix;
          if (accessorySuffix) {
            console.log(`[fn/generate] ⊕ accessories for ${subId}:`, accessoryIds);
          }

          let resultB64: string;
          // promptSource + totalAttempts are hoisted above the try — see
          // comment where they're declared.

          if (shouldSequence) {
            // (C) Sequential per-person editing. Bumping the function's
            // timeoutSeconds above (120s) may be necessary if users
            // routinely pick 5+ people × 3+ variants; for the common
            // 2–3 person case this fits comfortably.
            console.log(
              `[fn/generate] ▼ sequential mode: ${selected.length} per-person passes for subId=${subId}`,
            );
            let current = body.imageBase64;
            for (let j = 0; j < selected.length; j++) {
              const person = selected[j];
              let personPrompt: string;
              try {
                personPrompt = await composePrompt({
                  imageBase64: current,
                  transformation: basePrompt,
                  selectedPeopleLabels: [person],
                  totalPeopleInImage: total,
                });
              } catch (composeErr) {
                console.warn(
                  `[fn/generate] composer failed on pass ${j + 1}/${selected.length}, using static scoped prompt:`,
                  composeErr,
                );
                personPrompt = buildScopedPrompt(basePrompt, [person], total);
              }
              console.log(
                `[fn/generate] ▼ pass ${j + 1}/${selected.length} — target: "${person}" — subId: ${subId}`,
              );
              console.log(personPrompt);
              console.log('[fn/generate] ▲ end pass prompt');
              const pass = await generateOne(current, personPrompt);
              current = pass.b64;
              totalAttempts += pass.attempts;
            }
            resultB64 = current;
            promptSource = 'sequential';
          } else {
            let finalPrompt: string;
            if (isMultiPerson) {
              try {
                finalPrompt = await composePrompt({
                  imageBase64: body.imageBase64,
                  transformation: basePrompt,
                  selectedPeopleLabels: body.selectedPeopleLabels,
                  totalPeopleInImage: body.totalPeopleInImage,
                });
                promptSource = 'composed';
              } catch (composeErr) {
                console.warn('[fn/generate] composer failed, falling back to static prompt:', composeErr);
                finalPrompt = buildScopedPrompt(
                  basePrompt,
                  body.selectedPeopleLabels,
                  body.totalPeopleInImage,
                );
                promptSource = 'composed-fallback';
              }
            } else {
              finalPrompt = buildScopedPrompt(
                basePrompt,
                body.selectedPeopleLabels,
                body.totalPeopleInImage,
              );
              promptSource = 'static';
            }
            console.log('[fn/generate] ▼▼▼ PROMPT SENT TO NANO BANANA ▼▼▼');
            console.log('[fn/generate] subId:', subId, '| source:', promptSource, '| total:', total, '| selected:', selected);
            console.log(finalPrompt);
            console.log('[fn/generate] ▲▲▲ END PROMPT ▲▲▲');
            const pass = await generateOne(body.imageBase64, finalPrompt);
            resultB64 = pass.b64;
            totalAttempts = pass.attempts;
          }

          const url = await uploadImage(uid, generationId, `result_${i}`, resultB64);
          console.log(`[fn/generate] ✓ subId=${subId} complete — source=${promptSource}`);
          // Store the base (unwrapped) prompt — the gallery shows the
          // transformation the user asked for, not the scoping preamble.
          const item = { imageURL: url, prompt: meta.prompt, label: meta.label, subcategoryId: subId };
          results.push(item);
          await writeLog({
            status: 'complete',
            errorMessage: null,
            promptSource,
            attempts: totalAttempts,
          });
          await sendEvent({ type: 'result', index: i, item });
          completedCount++;
        } catch (err: any) {
          const reason = err?.message ?? String(err);
          console.warn(`Generation failed for ${subId}:`, err);
          await writeLog({
            status: 'failed',
            errorMessage: reason,
            promptSource,
            attempts: totalAttempts,
          });
          await sendEvent({ type: 'error', index: i, subcategoryId: subId, message: reason });
          failedCount++;
        }
      }

      if (results.length === 0) {
        await genRef.update({ status: 'failed' });
        await sendEvent({ type: 'done', generationId, completed: 0, failed: failedCount });
        res.end();
        return;
      }

      await genRef.update({
        results: results.map(({ imageURL, prompt, label }) => ({ imageURL, prompt, label })),
        status: 'complete',
      });

      const userRef = admin.firestore().collection('users').doc(uid);
      const userSnap = await userRef.get();
      const user = userSnap.data() as { subscriptionStatus?: string };
      if (user.subscriptionStatus !== 'pro') {
        await userRef.update({
          freeGenerationsUsed: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await sendEvent({
        type: 'done',
        generationId,
        completed: completedCount,
        failed: failedCount,
      });
      res.end();
    } catch (e: any) {
      console.error('generate failed', e);
      // If the stream hasn't started yet (pre-start failures: auth,
      // quota, validation that slipped past), send the legacy
      // status-code response so the client's HTTP-status error path
      // still works. Once headers are sent, we can only emit a fatal
      // event and close.
      if (res.headersSent) {
        try {
          res.write(JSON.stringify({ type: 'fatal', message: e?.message ?? 'Internal error' }) + '\n');
        } catch {
          /* connection already torn down */
        }
        res.end();
      } else if (e instanceof functions.https.HttpsError) {
        res.status(e.code === 'unauthenticated' ? 401 : 500).send(e.message);
      } else {
        res.status(500).send(e?.message ?? 'Internal error');
      }
    }
  });
