// Local dev API route for people detection.
//
// Thin POST wrapper around lib/serverDetection.runPeopleDetection.
// The actual Gemini call, prompt, and parsing live in that shared
// module so app/api/generate+api.ts's server-side minor gate can
// re-detect without duplicating the prompt.
//
// Server-only: imports nothing React-Native-ish. Reads GEMINI_API_KEY
// at request time inside runPeopleDetection.

import {
  runPeopleDetection,
  checkLocalRateLimit,
  MAX_IMAGE_BASE64_BYTES,
} from '@/lib/serverDetection';

export async function POST(request: Request): Promise<Response> {
  let body: { imageBase64?: string };
  try {
    body = (await request.json()) as { imageBase64?: string };
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!body?.imageBase64) {
    return new Response('Invalid body: require { imageBase64 }', { status: 400 });
  }
  if (body.imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
    const sizeMB = (body.imageBase64.length / 1024 / 1024).toFixed(1);
    const limitMB = (MAX_IMAGE_BASE64_BYTES / 1024 / 1024).toFixed(0);
    return new Response(
      `Image too large (${sizeMB}MB encoded, limit ${limitMB}MB). Pick a smaller photo.`,
      { status: 413 },
    );
  }

  // In-memory rate limit. The local-dev route has no auth, so we key on
  // the best identifier the request carries — the client IP as reported
  // by the dev server. Behind a proxy this would need an XFF parse, but
  // Expo's dev server runs on localhost so the raw connection address
  // is enough.
  //
  // Production Cloud Function uses a Firestore-transaction limiter keyed
  // by authenticated uid (see functions/src/detect.ts checkRateLimit).
  // That's the real defense. This is just a runaway-dev-script guard.
  const rateLimitKey =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'local';
  if (!checkLocalRateLimit(rateLimitKey)) {
    return new Response('Rate limit exceeded (20/min). Try again in a minute.', {
      status: 429,
    });
  }

  try {
    const result = await runPeopleDetection(body.imageBase64);
    return Response.json(result);
  } catch (e: any) {
    console.error('[api/detect] error', e);
    return new Response(e?.message ?? 'Detection failed', { status: 500 });
  }
}
