// Cloud Function mirror of `app/api/detect+api.ts`.
//
// Same Gemini 2.5 Flash vision prompt + same response shape
// (`{ people: [...], safety: {...} }`). Auth-required (same Bearer
// token contract as the generate function), so signed-in users on the
// deployed app can hit the production endpoint instead of the
// Expo Router server route.
//
// Keeping in sync with `app/api/detect+api.ts`:
//   - DETECTION_PROMPT must stay identical between the two so prompt
//     iteration on one side doesn't drift on the other. If you change
//     the prompt in either file, copy it to the other.
//   - Response shape must match `lib/detect.ts` DetectResponse
//     (`{ people: DetectedPerson[]; safety?: SafetyVerdict }`).
//   - normalizePeople / normalizeSafety / extractJsonResponse are
//     copy-paste from the local route; same defensive parsing logic.
//
// Runtime: Gen1 (matches the rest of the deployed functions). Memory
// stays at the 256MB default — vision calls are CPU-light on our
// side, the heavy lifting is on Gemini's server.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_ID = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
const MAX_IMAGE_BASE64_BYTES = 12 * 1024 * 1024;

interface DetectedPerson {
  id: number;
  label: string;
  box: { ymin: number; xmin: number; ymax: number; xmax: number };
  appearsUnder18: boolean;
}

type SafetyDecision = 'safe' | 'flagged' | 'blocked';

interface SafetyVerdict {
  decision: SafetyDecision;
  reason: string;
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
  const key = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(key);
}

async function verifyAuth(req: functions.https.Request): Promise<string> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing bearer token');
  }
  const token = header.substring(7);
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded.uid;
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
  // Fallback: bare array (legacy shape) — see local-route comment.
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

export const detect = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    try {
      await verifyAuth(req);
      const body = req.body as { imageBase64?: string };
      if (!body?.imageBase64) {
        res.status(400).send('Invalid body: require { imageBase64 }');
        return;
      }
      if (body.imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
        const sizeMB = (body.imageBase64.length / 1024 / 1024).toFixed(1);
        const limitMB = (MAX_IMAGE_BASE64_BYTES / 1024 / 1024).toFixed(0);
        res
          .status(413)
          .send(`Image too large (${sizeMB}MB encoded, limit ${limitMB}MB). Pick a smaller photo.`);
        return;
      }

      const genAI = getGenAI();
      const model = genAI.getGenerativeModel({ model: MODEL_ID });

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
          console.warn(`[fn/detect] attempt ${attempt} failed (${status}); retrying in ${delay}ms`);
          await new Promise((r2) => setTimeout(r2, delay));
        }
      }
      if (!text) throw lastErr instanceof Error ? lastErr : new Error('Detection failed');

      const { people: rawPeople, safetyRaw } = extractJsonResponse(text);
      const people = normalizePeople(rawPeople);
      const safety = normalizeSafety(safetyRaw);

      res.status(200).json({ people, safety });
    } catch (e: any) {
      console.error('[fn/detect] error', e);
      if (e instanceof functions.https.HttpsError) {
        res.status(e.code === 'unauthenticated' ? 401 : 500).send(e.message);
      } else {
        res.status(500).send(e?.message ?? 'Detection failed');
      }
    }
  });
