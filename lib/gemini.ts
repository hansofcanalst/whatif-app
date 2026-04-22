import { auth } from './firebase';
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

export async function requestGeneration(req: GenerateRequest): Promise<GenerateResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated.');
  const token = await user.getIdToken();

  const res = await fetch(`${config.cloudFunctions.baseURL}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
  });

  if (res.status === 402) throw new QuotaExceededError();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Generation failed (${res.status}): ${body}`);
  }
  return (await res.json()) as GenerateResponse;
}
