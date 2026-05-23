// Shared server-only people-detection module.
//
// Used by BOTH the local-dev /api/detect route AND the local-dev
// /api/generate route's server-side minor gate. Extracting the actual
// Gemini call here means:
//   - the gate in /api/generate can re-detect without an internal HTTP
//     hop or duplicating the Gemini prompt
//   - the detect+api.ts route stays a thin POST wrapper
//   - the DETECTION_PROMPT lives in exactly one place on the local-dev
//     side (the production mirror in functions/src/detect.ts is a
//     copy — kept in sync by convention)
//
// IMPORTANT: server-only. Imports nothing from `lib/firebase.ts` or
// anything that pulls in React Native. The Metro bundler will tree-
// shake this out of the client bundle as long as no client code imports
// it (currently only the two server routes do).

import { GoogleGenerativeAI } from '@google/generative-ai';

// Vision model — free tier has access. Override via env if needed.
const MODEL_ID = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';

// Same defense-against-oversize-upload ceiling as /api/generate. Exported
// so callers (the detect route + the minor gate) share one number.
export const MAX_IMAGE_BASE64_BYTES = 12 * 1024 * 1024;

// ─── Types (also re-exported by the route so client code can import) ────

export interface DetectedPerson {
  id: number;
  label: string;
  box: { ymin: number; xmin: number; ymax: number; xmax: number };
  appearsUnder18: boolean;
}

export type SafetyDecision = 'safe' | 'flagged' | 'blocked';

export interface SafetyVerdict {
  decision: SafetyDecision;
  reason: string;
}

export interface DetectResponse {
  people: DetectedPerson[];
  safety: SafetyVerdict;
}

// ─── Prompt + parsing ───────────────────────────────────────────────────

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
    throw new Error(
      'GEMINI_API_KEY missing on the server. Add it to .env and restart the dev server.',
    );
  }
  return new GoogleGenerativeAI(key);
}

function extractJsonResponse(text: string): { people: unknown[]; safetyRaw: unknown } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const firstObj = cleaned.indexOf('{');
  const firstArr = cleaned.indexOf('[');
  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    const last = cleaned.lastIndexOf('}');
    if (last < firstObj) {
      throw new Error(`Model returned malformed JSON object. Got: ${text.slice(0, 200)}`);
    }
    const parsed = JSON.parse(cleaned.slice(firstObj, last + 1)) as Record<string, unknown>;
    const people = Array.isArray(parsed.people) ? parsed.people : [];
    return { people, safetyRaw: parsed.safety };
  }
  // Backwards compat with bare-array shape (legacy / cached responses).
  const last = cleaned.lastIndexOf(']');
  if (firstArr === -1 || last < firstArr) {
    throw new Error(`Model did not return JSON. Got: ${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(cleaned.slice(firstArr, last + 1));
  if (!Array.isArray(parsed)) throw new Error('Top-level JSON value is not an array.');
  return { people: parsed, safetyRaw: undefined };
}

function normalizeSafety(raw: unknown): SafetyVerdict {
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
    const clamp = (n: number) => Math.max(0, Math.min(1000, n));
    const rawFlag = r.appears_under_18 ?? r.appearsUnder18;
    const labelSuggestsMinor = /\b(child|kid|baby|infant|toddler|teen|teenager|boy|girl)\b/i.test(label);
    let appearsUnder18: boolean;
    if (typeof rawFlag === 'boolean') {
      appearsUnder18 = rawFlag;
    } else if (typeof rawFlag === 'string') {
      appearsUnder18 = rawFlag.toLowerCase() === 'true';
    } else {
      // Fail-closed when the field is missing: if the label mentions a
      // child age bracket, treat as a minor. Better to surface a
      // consent modal the user dismisses than to miss one.
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

// ─── Public entry point ─────────────────────────────────────────────────

/**
 * Call Gemini Flash vision to detect people + classify safety on the
 * supplied image. Single function used by both the /api/detect route
 * (HTTP-exposed) and the /api/generate route's minor gate
 * (internal-only). Throws on Gemini errors after retries are exhausted.
 *
 * Retries 429 / 5xx with bounded exponential backoff — matches the
 * policy in composePrompt.ts and generate+api.ts so every Gemini call
 * in the pipeline behaves the same way.
 */
export async function runPeopleDetection(imageBase64: string): Promise<DetectResponse> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_ID });

  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 3;
  let text = '';
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent([
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        { text: DETECTION_PROMPT },
      ]);
      text = result.response.text();
      break;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (!status || !RETRYABLE.has(status) || attempt === MAX_ATTEMPTS) throw err;
      const delay = 500 * attempt + Math.floor(Math.random() * 250);
      console.warn(`[serverDetection] attempt ${attempt} failed (${status}); retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (!text) throw lastErr instanceof Error ? lastErr : new Error('Detection failed');

  const { people: rawPeople, safetyRaw } = extractJsonResponse(text);
  return {
    people: normalizePeople(rawPeople),
    safety: normalizeSafety(safetyRaw),
  };
}

// ─── In-memory rate limiter (local-dev only) ────────────────────────────

/**
 * Process-global sliding-window rate limiter for the local-dev detect
 * route. The production Cloud Function uses a Firestore-transaction
 * limiter keyed by uid (see functions/src/generate.ts); the local dev
 * server has no Firestore admin and no real auth, so we approximate
 * with an in-memory map keyed by a caller-supplied identifier (the
 * caller passes Request headers — IP-ish — when no real id is
 * available). This isn't a security-grade defense; the production
 * version is. It exists so a runaway dev script doesn't blow through
 * the Gemini quota in 30 seconds.
 *
 * Returns `true` when the call should proceed, `false` when rate-limited.
 */
const RATE_LIMIT_PER_MINUTE = 20;
type Window = { windowStart: number; count: number };
const detectWindows = new Map<string, Window>();

export function checkLocalRateLimit(key: string): boolean {
  const now = Date.now();
  const w = detectWindows.get(key);
  if (!w || now - w.windowStart >= 60_000) {
    detectWindows.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (w.count >= RATE_LIMIT_PER_MINUTE) return false;
  w.count++;
  return true;
}
