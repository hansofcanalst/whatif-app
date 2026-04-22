import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
