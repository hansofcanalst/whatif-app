import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { storage } from './firebase';

export async function uploadImage(path: string, data: Blob | Uint8Array): Promise<string> {
  const r = ref(storage, path);
  await uploadBytes(r, data, { contentType: 'image/jpeg' });
  return getDownloadURL(r);
}

export async function fetchAsBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

export function pathForOriginal(uid: string, generationId: string): string {
  return `users/${uid}/generations/${generationId}/original.jpg`;
}

export function pathForResult(uid: string, generationId: string, index: number): string {
  return `users/${uid}/generations/${generationId}/result_${index}.jpg`;
}

// Companion paths for the 256px thumbnails generated alongside each
// full-res upload. The gallery uses these to keep first-paint bytes
// low; the result-detail screen falls back to the full image where
// pixel quality matters.
export function pathForOriginalThumb(uid: string, generationId: string): string {
  return `users/${uid}/generations/${generationId}/original_thumb.jpg`;
}

export function pathForResultThumb(uid: string, generationId: string, index: number): string {
  return `users/${uid}/generations/${generationId}/result_${index}_thumb.jpg`;
}

/**
 * Resize an image (data URI or remote URL) to a max-width thumbnail
 * and return a Blob. Uses expo-image-manipulator which works on web
 * (canvas-backed) and native (libjpeg/CoreImage-backed) without any
 * extra native modules. The 256px target is chosen to look crisp on
 * 3-up gallery thumbs (~120pt × 3x device pixel ratio = ~360px) with
 * room to spare for retina densities.
 *
 * Quality 0.7 gets the byte-size sweet spot for thumbnails — visible
 * difference vs. 0.85 is minimal at this size, and the savings
 * compound across hundreds of thumbnails.
 */
export async function resizeToThumbnail(uri: string, maxSize = 256): Promise<Blob> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: false },
  );
  // manipulateAsync returns a uri pointing at a temp file (native) or
  // a blob URL / data URI (web). Either way, fetch can read it.
  return fetchAsBlob(result.uri);
}
