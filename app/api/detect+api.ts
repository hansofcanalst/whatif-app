// Local dev API route for people detection.
//
// Uses Gemini 2.5 Flash (vision) to locate each person in the image and
// return a normalized bounding box + a short descriptive label. The label
// is what we later inject into the image-gen prompt to scope transformation
// to the user's selected subset (Nano Banana has no mask support).
//
// Server-only: imports nothing React-Native-ish. Reads GEMINI_API_KEY at
// request time.

import { GoogleGenerativeAI } from '@google/generative-ai';

// Vision/text model, not the image model. Free tier has access to this.
const MODEL_ID = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';

// Gemini's canonical bbox convention: [ymin, xmin, ymax, xmax] normalized
// to 0-1000. We keep that on the wire so no client-side math has to guess.
interface DetectedPerson {
  id: number;
  label: string;
  box: { ymin: number; xmin: number; ymax: number; xmax: number };
}

const DETECTION_PROMPT = `You are a people detector. Look at this image and locate every distinct human person that is at least partially visible.

For each person, produce:
- "label": a short (3-8 word) UNIQUE description that could be used to tell this person apart from the others in the image. Use distinguishing details like visible clothing (colors, logos, text on shirts), position (left/center/right, foreground/background), approximate age bracket (child / teen / adult / elderly), or accessories (glasses, hat, necklace). AVOID ethnicity, race, gender, or other identity assumptions — use clothing and position instead.
- "box_2d": [ymin, xmin, ymax, xmax] integer pixel coordinates normalized to 0-1000 (so the full image is 1000x1000). The box should tightly enclose the person's head AND visible body.

Return ONLY a JSON array. No prose, no explanation, no markdown code fences. If no people are visible, return [].

Example output:
[{"label":"child in MIAMI jersey on left","box_2d":[150,20,820,280]},{"label":"woman with long hair in center","box_2d":[180,380,900,660]}]`;

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY missing on the server. Add it to .env and restart the dev server.');
  }
  return new GoogleGenerativeAI(key);
}

/**
 * Gemini sometimes wraps JSON in ```json ... ``` fences or prepends a stray
 * sentence despite the prompt. Strip fences and extract the outermost array.
 */
function extractJsonArray(text: string): unknown[] {
  // Strip ``` fences.
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // Find the first '[' and last ']' — handles prepended prose.
  const first = cleaned.indexOf('[');
  const last = cleaned.lastIndexOf(']');
  if (first === -1 || last === -1 || last < first) {
    throw new Error(`Model did not return a JSON array. Got: ${text.slice(0, 200)}`);
  }
  cleaned = cleaned.slice(first, last + 1);
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Top-level JSON value is not an array.');
  return parsed;
}

function normalizePeople(raw: unknown[]): DetectedPerson[] {
  const people: DetectedPerson[] = [];
  raw.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    const box = r.box_2d ?? r.box;
    if (!label || !Array.isArray(box) || box.length !== 4) return;
    const [ymin, xmin, ymax, xmax] = box.map((n) => Number(n));
    if ([ymin, xmin, ymax, xmax].some((n) => !Number.isFinite(n))) return;
    // Clamp to [0, 1000] in case the model returns slight overshoot.
    const clamp = (n: number) => Math.max(0, Math.min(1000, n));
    people.push({
      id: idx + 1,
      label,
      box: { ymin: clamp(ymin), xmin: clamp(xmin), ymax: clamp(ymax), xmax: clamp(xmax) },
    });
  });
  return people;
}

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

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: MODEL_ID });

    // Retry transient failures (Google 503s, 429s, brief network hiccups)
    // with bounded exponential backoff. Matches the policy in
    // lib/composePrompt.ts so both multimodal paths behave consistently.
    const RETRYABLE = new Set([429, 500, 502, 503, 504]);
    const MAX_ATTEMPTS = 3;
    let text = '';
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await model.generateContent([
          { inlineData: { mimeType: 'image/jpeg', data: body.imageBase64 } },
          { text: DETECTION_PROMPT },
        ]);
        text = result.response.text();
        break;
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number })?.status;
        if (!status || !RETRYABLE.has(status) || attempt === MAX_ATTEMPTS) throw err;
        const delay = 500 * attempt + Math.floor(Math.random() * 250);
        console.warn(`[api/detect] attempt ${attempt} failed (${status}); retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (!text) throw lastErr instanceof Error ? lastErr : new Error('Detection failed');

    const raw = extractJsonArray(text);
    const people = normalizePeople(raw);

    return Response.json({ people });
  } catch (e: any) {
    console.error('[api/detect] error', e);
    return new Response(e?.message ?? 'Detection failed', { status: 500 });
  }
}
