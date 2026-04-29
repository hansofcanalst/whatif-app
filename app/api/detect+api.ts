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

// Same defense-against-oversize-upload ceiling as /api/generate. Keep in
// sync with app/api/generate+api.ts so bypassing the pre-generate detect
// step can't be used to OOM the dev server either.
const MAX_IMAGE_BASE64_BYTES = 12 * 1024 * 1024;

// Gemini's canonical bbox convention: [ymin, xmin, ymax, xmax] normalized
// to 0-1000. We keep that on the wire so no client-side math has to guess.
interface DetectedPerson {
  id: number;
  label: string;
  box: { ymin: number; xmin: number; ymax: number; xmax: number };
  // Minor-moderation flag. True when the person visually appears to be
  // under 18. Drives a hard block on premium categories (celebrity /
  // political mashups, ethnicity blending) — see app/(tabs)/home.tsx.
  // We ask the same model that already has the image in context rather
  // than running a second pass; the cost is one extra JSON field.
  appearsUnder18: boolean;
}

const DETECTION_PROMPT = `You are a people detector and content safety classifier. Look at this image and produce TWO things in a single JSON object.

PART 1 — "people": an array of objects, one per distinct human person at least partially visible.
For each person, produce:
- "label": a short (3-8 word) UNIQUE description that could be used to tell this person apart from the others in the image. Use distinguishing details like visible clothing (colors, logos, text on shirts), position (left/center/right, foreground/background), approximate age bracket (child / teen / adult / elderly), or accessories (glasses, hat, necklace). AVOID ethnicity, race, gender, or other identity assumptions — use clothing and position instead.
- "box_2d": [ymin, xmin, ymax, xmax] integer pixel coordinates normalized to 0-1000 (so the full image is 1000x1000). The box should tightly enclose the person's head AND visible body.
- "appears_under_18": boolean. True if the person visually appears to be a minor (under 18 — infant, child, or teenager). When in doubt between "young adult" and "teen", err on the side of true. This flag is used to block certain transformations on minors, so false negatives are worse than false positives.

PART 2 — "safety": an object classifying whether the image is appropriate for AI image transformation in a consumer app.
Produce:
- "decision": one of "safe" | "flagged" | "blocked".
  - "safe": typical photo with no problematic content. The vast majority of inputs.
  - "flagged": questionable content the app should warn the user about but still allow (e.g. mild suggestiveness, brief alcohol, minor blood). User opts in to proceed.
  - "blocked": content the app must refuse. Includes: nudity or sexually explicit imagery, gore/severe violence, self-harm, drug paraphernalia in heavy use, hate symbols, identifiable real children in unsafe contexts, or other clearly inappropriate-for-consumer-AI subject matter.
- "reason": a short user-facing explanation (≤25 words). For "safe" you may use "ok".

Be CONSERVATIVE on "blocked" — false positives annoy users; false negatives create real harm. When the photo is a normal selfie/portrait/group shot with no visible problematic content, return "safe".

Return ONLY a JSON object with shape {"people": [...], "safety": {...}}. No prose, no explanation, no markdown code fences. If no people are visible, set people to [].

Example output:
{"people":[{"label":"child in MIAMI jersey on left","box_2d":[150,20,820,280],"appears_under_18":true},{"label":"woman with long hair in center","box_2d":[180,380,900,660],"appears_under_18":false}],"safety":{"decision":"safe","reason":"ok"}}`;

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY missing on the server. Add it to .env and restart the dev server.');
  }
  return new GoogleGenerativeAI(key);
}

/**
 * Gemini sometimes wraps JSON in ```json ... ``` fences or prepends a stray
 * sentence despite the prompt. Strip fences and extract the outermost
 * object. The new response shape is `{ people: [...], safety: {...} }`.
 *
 * For backwards compatibility with any cached prompt responses that
 * came back as a bare array (the old shape), we ALSO accept arrays
 * and treat them as `{ people: <array>, safety: undefined }`. Avoids
 * a brittle migration if the prompt cache or a stale model returns
 * the old shape briefly.
 */
function extractJsonResponse(text: string): { people: unknown[]; safetyRaw: unknown } {
  let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstObj = cleaned.indexOf('{');
  const firstArr = cleaned.indexOf('[');
  // Prefer object detection if it appears first — that's the new shape.
  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    const last = cleaned.lastIndexOf('}');
    if (last < firstObj) {
      throw new Error(`Model returned malformed JSON object. Got: ${text.slice(0, 200)}`);
    }
    const parsed = JSON.parse(cleaned.slice(firstObj, last + 1)) as Record<string, unknown>;
    const people = Array.isArray(parsed.people) ? parsed.people : [];
    return { people, safetyRaw: parsed.safety };
  }
  // Fallback: bare array (old shape).
  const last = cleaned.lastIndexOf(']');
  if (firstArr === -1 || last < firstArr) {
    throw new Error(`Model did not return JSON. Got: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(cleaned.slice(firstArr, last + 1));
  if (!Array.isArray(parsed)) throw new Error('Top-level JSON value is not an array.');
  return { people: parsed, safetyRaw: undefined };
}

type SafetyDecision = 'safe' | 'flagged' | 'blocked';

interface SafetyVerdict {
  decision: SafetyDecision;
  reason: string;
}

function normalizeSafety(raw: unknown): SafetyVerdict {
  // Default to "safe" when the model didn't supply a verdict (old
  // shape, parse failure, etc.). The detection step should NOT
  // hard-block users on its own ambiguity — it's a pre-filter, not a
  // final gate. The /api/generate endpoint runs Gemini's own safety
  // filters as a second line of defense.
  if (!raw || typeof raw !== 'object') {
    return { decision: 'safe', reason: 'no verdict' };
  }
  const obj = raw as Record<string, unknown>;
  const rawDecision = typeof obj.decision === 'string' ? obj.decision.toLowerCase() : '';
  const decision: SafetyDecision =
    rawDecision === 'blocked' ? 'blocked' :
    rawDecision === 'flagged' ? 'flagged' :
    'safe';
  const reason = typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : 'ok';
  return { decision, reason };
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
    // Accept either the prompt's snake_case key or an accidental camelCase.
    // Fail-closed: treat anything truthy that isn't explicitly `false` as
    // "under 18" when the field is missing and the label mentions a child
    // age bracket. This is the moderation-safe default — better to surface
    // a consent modal the user dismisses than to miss a minor.
    const rawFlag = r.appears_under_18 ?? r.appearsUnder18;
    const labelSuggestsMinor = /\b(child|kid|baby|infant|toddler|teen|teenager|boy|girl)\b/i.test(label);
    let appearsUnder18: boolean;
    if (typeof rawFlag === 'boolean') {
      appearsUnder18 = rawFlag;
    } else if (typeof rawFlag === 'string') {
      appearsUnder18 = rawFlag.toLowerCase() === 'true';
    } else {
      appearsUnder18 = labelSuggestsMinor;
    }
    people.push({
      id: idx + 1,
      label,
      box: { ymin: clamp(ymin), xmin: clamp(xmin), ymax: clamp(ymax), xmax: clamp(xmax) },
      appearsUnder18,
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
  if (body.imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
    const sizeMB = (body.imageBase64.length / 1024 / 1024).toFixed(1);
    const limitMB = (MAX_IMAGE_BASE64_BYTES / 1024 / 1024).toFixed(0);
    return new Response(
      `Image too large (${sizeMB}MB encoded, limit ${limitMB}MB). Pick a smaller photo.`,
      { status: 413 },
    );
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

    const { people: rawPeople, safetyRaw } = extractJsonResponse(text);
    const people = normalizePeople(rawPeople);
    const safety = normalizeSafety(safetyRaw);

    return Response.json({ people, safety });
  } catch (e: any) {
    console.error('[api/detect] error', e);
    return new Response(e?.message ?? 'Detection failed', { status: 500 });
  }
}
