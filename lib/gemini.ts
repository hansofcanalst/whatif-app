import { collection, doc, serverTimestamp, setDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db } from './firebase';
import { fetchAsBlob, uploadImage, pathForOriginal, pathForResult } from './storage';
import { config } from '@/constants/config';

export interface GenerateRequest {
  imageBase64: string;
  category: string;
  subcategoryIds: string[];
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

export async function requestGeneration(req: GenerateRequest): Promise<GenerateResponse> {
  const { url, isLocalDev } = resolveEndpoint();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!isLocalDev) {
    // Deployed Cloud Function verifies Firebase ID token server-side.
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated.');
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
  });

  if (res.status === 402) throw new QuotaExceededError();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Generation failed (${res.status}): ${body}`);
  }

  const response = (await res.json()) as GenerateResponse;

  // Local dev: persist to Firebase Storage + Firestore so Gallery works.
  // The production Cloud Function does this server-side, so we skip it there.
  if (isLocalDev) {
    try {
      return await persistLocalGeneration(req, response);
    } catch (e) {
      // Persistence failure shouldn't block showing the user their results.
      // They just won't appear in the Gallery tab. Log so dev knows why.
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
async function persistLocalGeneration(
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

  // Upload original.
  const originalBlob = base64ToBlob(req.imageBase64, 'image/jpeg');
  const originalURL = await uploadImage(pathForOriginal(uid, generationId), originalBlob);

  // Upload each result, replacing the data URI with the Storage URL.
  const uploadedResults: GenerateResponseItem[] = [];
  for (let i = 0; i < response.results.length; i++) {
    const r = response.results[i]!;
    const blob = await fetchAsBlob(r.imageURL); // data: URI → Blob
    const storageURL = await uploadImage(pathForResult(uid, generationId, i), blob);
    uploadedResults.push({ ...r, imageURL: storageURL });
  }

  // Write Firestore doc (shape matches GenerationDoc so Gallery/Result screens read it).
  const genRef = doc(collection(db, 'generations'), generationId);
  await setDoc(genRef, {
    id: generationId,
    userId: uid,
    categoryId: req.category,
    categoryLabel: req.category,
    originalImageURL: originalURL,
    results: uploadedResults.map(({ imageURL, prompt, label }) => ({ imageURL, prompt, label })),
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
