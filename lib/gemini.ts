import { collection, doc, serverTimestamp, setDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  fetchAsBlob,
  uploadImage,
  pathForOriginal,
  pathForResult,
  pathForOriginalThumb,
  pathForResultThumb,
  resizeToThumbnail,
} from './storage';
import { config } from '@/constants/config';

export interface GenerateRequest {
  imageBase64: string;
  category: string;
  subcategoryIds: string[];
  // Optional scope: labels of the people the user picked from the
  // detection step. If provided AND the image has multiple people,
  // the server wraps the prompt to transform only these people.
  // If omitted / empty, the transformation applies to the whole image
  // as before.
  selectedPeopleLabels?: string[];
  // Total people count from detection — lets the server skip scoping
  // when selectedPeopleLabels covers everyone.
  totalPeopleInImage?: number;
  // Detection flagged at least one visible person as under 18. Forwarded
  // to the server for moderation_log bookkeeping. The home screen already
  // hard-blocks premium categories when this is true, so it should never
  // be true for a premium generation that reaches the endpoint — we log
  // it anyway so anomalies (bypass attempts, detector disagreements) are
  // auditable after the fact.
  containsMinor?: boolean;
  // Optional opt-in styling add-ons keyed by subcategoryId. Each entry's
  // value is an array of accessory ids (e.g. ['durag']) that the user
  // ticked on the category screen. The server resolves these to prompt
  // snippets via appendAccessoryPrompt() and appends them to the base
  // subcategory prompt before all the scoping/branching logic. Unknown
  // ids are silently skipped server-side.
  modifiers?: Record<string, string[]>;
}

export interface GenerateResponseItem {
  imageURL: string;
  label: string;
  prompt: string;
  subcategoryId: string;
}

export interface GenerateResponse {
  generationId: string;
  results: GenerateResponseItem[];
}

export class QuotaExceededError extends Error {
  constructor() {
    super('Free generation quota exceeded.');
    this.name = 'QuotaExceededError';
  }
}

// NDJSON event shape emitted by the streaming /api/generate endpoint and
// the Cloud Function mirror. Events arrive one per line; each event
// corresponds to either a lifecycle boundary (`start`, `done`, `fatal`)
// or a per-subcategory outcome (`result`, `error`). The `index` field on
// `result` / `error` matches the subcategoryIds position in the request,
// so the client can show a stable grid of tiles that fill in as events
// land.
export type GenerationEvent =
  | { type: 'start'; generationId: string; total: number }
  | { type: 'result'; index: number; item: GenerateResponseItem }
  | { type: 'error'; index: number; subcategoryId: string; message: string }
  | { type: 'done'; generationId: string; completed: number; failed: number }
  | { type: 'fatal'; message: string };

/**
 * Build the target URL for the generate endpoint.
 *
 * - If EXPO_PUBLIC_CLOUD_FUNCTIONS_URL is set → hit the deployed Cloud Function.
 * - Otherwise → fall back to the local Expo Router API route at `/api/generate`
 *   (see `app/api/generate+api.ts`). The local route skips auth + quota and
 *   returns images as data URIs — dev only. The client then persists to
 *   Firestore + Storage here so the Gallery tab populates.
 */
function resolveEndpoint(): { url: string; isLocalDev: boolean } {
  const base = config.cloudFunctions.baseURL?.trim();
  if (base) {
    return { url: `${base}/generate`, isLocalDev: false };
  }
  return { url: '/api/generate', isLocalDev: true };
}

/**
 * Open a streaming generation. The server emits one NDJSON line per
 * event; we parse them as they land and invoke `onEvent` for each one.
 *
 * The returned promise resolves after the stream closes cleanly. It
 * REJECTS on:
 *   - Non-OK HTTP status before the stream body starts (auth 401, quota
 *     402 → QuotaExceededError, size 413, model 5xx before first event).
 *   - A `fatal` event mid-stream (re-thrown so the caller's catch runs).
 *   - A transport error tearing down the reader.
 *
 * Per-subcategory failures (`error` events) are NOT treated as errors at
 * this layer — they're normal data and flow through `onEvent` like any
 * other event. Callers decide how to surface them.
 *
 * Cancellation: pass an AbortSignal to abandon the stream mid-flight.
 * The server keeps running server-side (no way to reach into the
 * Gemini call), but the client stops consuming.
 */
export async function streamGeneration(
  req: GenerateRequest,
  onEvent: (event: GenerationEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { url, isLocalDev } = resolveEndpoint();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isLocalDev) {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated.');
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    signal,
  });

  if (res.status === 402) throw new QuotaExceededError();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Generation failed (${res.status}): ${body}`);
  }

  // Expo Router's dev server + Node both give us a ReadableStream body.
  // If that's missing (e.g. a non-streaming legacy server), fall back
  // to aggregating the full body — callers still get the same events.
  if (!res.body) {
    const text = await res.text();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed) as GenerationEvent);
      } catch (e) {
        console.warn('[gemini] skipping malformed NDJSON line:', trimmed.slice(0, 200));
      }
    }
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Split on newline; keep any trailing partial line in the buffer.
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        let ev: GenerationEvent;
        try {
          ev = JSON.parse(line) as GenerationEvent;
        } catch {
          console.warn('[gemini] skipping malformed NDJSON line:', line.slice(0, 200));
          continue;
        }
        onEvent(ev);
        // Fatal events halt the stream on the server; surface as an
        // exception so callers' catch blocks fire.
        if (ev.type === 'fatal') {
          throw new Error(ev.message || 'Generation failed.');
        }
      }
    }
    // Flush any trailing event that didn't end with a newline.
    const rest = buffer.trim();
    if (rest) {
      try {
        onEvent(JSON.parse(rest) as GenerationEvent);
      } catch {
        console.warn('[gemini] skipping malformed trailing NDJSON:', rest.slice(0, 200));
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

/**
 * Backward-compatible non-streaming wrapper. Consumes the stream and
 * resolves with an aggregated GenerateResponse once the server emits
 * `done`. Kept so any caller that still wants a single promise can stay
 * unchanged; new UI (the /generate/results screen) should use
 * streamGeneration directly for progressive rendering.
 */
export async function requestGeneration(req: GenerateRequest): Promise<GenerateResponse> {
  const { isLocalDev } = resolveEndpoint();

  let generationId = '';
  const resultsByIndex: Record<number, GenerateResponseItem> = {};

  await streamGeneration(req, (ev) => {
    if (ev.type === 'start') generationId = ev.generationId;
    else if (ev.type === 'result') resultsByIndex[ev.index] = ev.item;
    else if (ev.type === 'done' && !generationId) generationId = ev.generationId;
  });

  // Reassemble into the original order the caller asked for.
  const results: GenerateResponseItem[] = [];
  const indices = Object.keys(resultsByIndex).map(Number).sort((a, b) => a - b);
  for (const i of indices) results.push(resultsByIndex[i]);
  const response: GenerateResponse = { generationId, results };

  if (isLocalDev) {
    try {
      return await persistLocalGeneration(req, response);
    } catch (e) {
      console.warn('[gemini] local persistence failed, results will not appear in Gallery:', e);
      return response;
    }
  }
  return response;
}

/**
 * After a successful local-dev generation, upload the original + each result
 * to Firebase Storage and write the `generations/{id}` Firestore doc so the
 * Gallery tab populates. Also increments the user's free-generation counter.
 *
 * Returns the response with Storage download URLs replacing the data URIs.
 */
export async function persistLocalGeneration(
  req: GenerateRequest,
  response: GenerateResponse,
): Promise<GenerateResponse> {
  const user = auth.currentUser;
  if (!user) {
    // Not signed in — skip persistence, just show results for this session.
    return response;
  }

  const uid = user.uid;
  // Use the dev route's id as the Firestore doc id.
  const generationId = response.generationId;

  // Upload original AND a 256px thumbnail in parallel. Thumbnail
  // failures are logged and don't block — better to ship the doc
  // without a thumb than to fail the whole upload. The gallery falls
  // back to the full URL when thumbURL is missing.
  const originalDataUri = `data:image/jpeg;base64,${req.imageBase64}`;
  const originalBlob = base64ToBlob(req.imageBase64, 'image/jpeg');
  const [originalURL, originalThumbURL] = await Promise.all([
    uploadImage(pathForOriginal(uid, generationId), originalBlob),
    resizeToThumbnail(originalDataUri)
      .then((thumb) => uploadImage(pathForOriginalThumb(uid, generationId), thumb))
      .catch((e) => {
        console.warn('[gemini] original thumbnail failed:', e);
        return undefined;
      }),
  ]);

  // Upload each result + its thumbnail, replacing the data URI with
  // the Storage URLs. Thumbnail soft-fails per result.
  const uploadedResults: Array<GenerateResponseItem & { thumbURL?: string }> = [];
  for (let i = 0; i < response.results.length; i++) {
    const r = response.results[i]!;
    const blob = await fetchAsBlob(r.imageURL); // data: URI → Blob
    const [storageURL, thumbURL] = await Promise.all([
      uploadImage(pathForResult(uid, generationId, i), blob),
      resizeToThumbnail(r.imageURL)
        .then((thumb) => uploadImage(pathForResultThumb(uid, generationId, i), thumb))
        .catch((e) => {
          console.warn(`[gemini] result ${i} thumbnail failed:`, e);
          return undefined;
        }),
    ]);
    uploadedResults.push({ ...r, imageURL: storageURL, thumbURL });
  }

  // Write Firestore doc (shape matches GenerationDoc so Gallery/Result
  // screens read it). originalThumbURL stored only when available so
  // older queries with `?? imageURL` fallback still work.
  const genRef = doc(collection(db, 'generations'), generationId);
  await setDoc(genRef, {
    id: generationId,
    userId: uid,
    categoryId: req.category,
    categoryLabel: req.category,
    originalImageURL: originalURL,
    ...(originalThumbURL ? { originalThumbURL } : {}),
    results: uploadedResults.map(({ imageURL, thumbURL, prompt, label }) => ({
      imageURL,
      ...(thumbURL ? { thumbURL } : {}),
      prompt,
      label,
    })),
    status: 'complete',
    createdAt: serverTimestamp(),
  });

  // Increment the free-generation counter (mirrors Cloud Function behavior).
  try {
    await updateDoc(doc(db, 'users', uid), {
      freeGenerationsUsed: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[gemini] could not increment freeGenerationsUsed:', e);
  }

  // Moderation audit log is server-only — `firestore.rules` denies all
  // client writes to `moderation_log`. Production audit goes through
  // `functions/src/generate.ts` (Admin SDK bypasses rules). The
  // local-dev /api/generate route emits a `[telemetry]` stdout line
  // instead, which is sufficient for dev visibility. No client write
  // here so we don't pretend to log something that always fails.

  return { generationId, results: uploadedResults };
}

/**
 * Convert a base64 string (no data: prefix) to a Blob without going through
 * fetch(dataURI). Avoids one round-trip and works identically on web and
 * native (via the browser/RN Blob polyfill that Firebase ships).
 */
function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}
