import { config } from '@/constants/config';

export interface DetectedPerson {
  id: number; // 1-indexed
  label: string;
  box: {
    // Gemini's convention: normalized 0-1000.
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  // Moderation flag from the detect step. True when the person visually
  // appears to be under 18. Consumed by the home screen to block premium
  // categories (celebrity / political mashups, ethnicity blending) and by
  // the moderation_log Firestore writes. See app/api/detect+api.ts for
  // the source and fail-closed fallback behavior.
  appearsUnder18: boolean;
}

/**
 * Image safety classification returned alongside people detection.
 * Pre-flight gate before letting the user kick off a generation —
 * complements (doesn't replace) the server-side Gemini safety filters
 * that run during generation itself.
 *
 *   - "safe": proceed normally
 *   - "flagged": warn the user but allow generation if they confirm
 *   - "blocked": refuse with the model's reason
 *
 * Default behavior on missing/invalid verdict is "safe" — see
 * normalizeSafety in the detect endpoint.
 */
export type SafetyDecision = 'safe' | 'flagged' | 'blocked';

export interface SafetyVerdict {
  decision: SafetyDecision;
  reason: string;
}

export interface DetectResponse {
  people: DetectedPerson[];
  safety?: SafetyVerdict;
}

function resolveEndpoint(): string {
  const base = config.cloudFunctions.baseURL?.trim();
  // When Cloud Functions are deployed, they can expose /detect too. Until
  // then, fall back to the Expo Router API route.
  return base ? `${base}/detect` : '/api/detect';
}

export async function requestDetection(imageBase64: string): Promise<DetectResponse> {
  const res = await fetch(resolveEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Detection failed (${res.status}): ${body}`);
  }
  return (await res.json()) as DetectResponse;
}
