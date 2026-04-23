// Two-stage prompt composition for Nano Banana.
//
// Static prompt templates can't produce the per-person, enumerated,
// appearance-aware instructions that Nano Banana needs for multi-subject
// edits. They don't see the photo. This module closes that gap: it asks
// Gemini 2.5 Flash (multimodal, cheap) to look at the image and write a
// single, tailored edit prompt for a given transformation.
//
// Pipeline:
//   1. client POST /api/generate with image + category/subcategory + selection
//   2. server: composePrompt(image, transformationIntent, scoping) → Flash →
//              a rich, enumerated prompt string
//   3. server: Nano Banana(image, composedPrompt) → edited image
//
// Falls back gracefully: if the Flash call errors or returns unusable text,
// the caller can fall back to the static `buildScopedPrompt` path.

import { GoogleGenerativeAI } from '@google/generative-ai';

// Text-capable Gemini model used for the composition step. Kept separate
// from the image model (GEMINI_IMAGE_MODEL) so either can be upgraded
// independently. Flash is a good default — fast and cheap.
const COMPOSER_MODEL_ID =
  process.env.GEMINI_COMPOSER_MODEL || 'gemini-2.5-flash';

export interface ComposeArgs {
  imageBase64: string;
  // Plain-English description of the edit — e.g. the subcategory's
  // base prompt. The composer treats this as the "intent" and expands
  // it into per-person instructions.
  transformation: string;
  // Optional: a subset of people to transform. When omitted or equal
  // to totalPeopleInImage, the composer targets everyone visible.
  selectedPeopleLabels?: string[];
  totalPeopleInImage?: number;
}

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY missing on the server. Add it to .env and restart the dev server.',
    );
  }
  return new GoogleGenerativeAI(key);
}

// Meta-prompt variant. v1 is the original "enumerate + describe + preserve"
// wording; v2 adds forced Person-N-of-N numbering, a 2-anchor requirement,
// softer preservation verbs, and a final verification checklist. Selected
// via env var GEMINI_META_PROMPT_VARIANT (v1 | v2, default v2) so the two
// can be A/B-compared against the same image model without a code edit.
type MetaVariant = 'v1' | 'v2';
function resolveVariant(): MetaVariant {
  const raw = (process.env.GEMINI_META_PROMPT_VARIANT || 'v2').toLowerCase();
  return raw === 'v1' ? 'v1' : 'v2';
}

function buildScopeLine(
  selectedPeopleLabels: string[] | undefined,
  totalPeopleInImage: number | undefined,
): string {
  const hasSubset =
    selectedPeopleLabels &&
    selectedPeopleLabels.length > 0 &&
    totalPeopleInImage != null &&
    selectedPeopleLabels.length < totalPeopleInImage;
  if (hasSubset) {
    return `SCOPE: Apply the transformation ONLY to these specific people: ${selectedPeopleLabels!
      .map((l) => `"${l}"`)
      .join(', ')}. Every other person in the photo must remain COMPLETELY UNCHANGED — identical face, skin, hair, expression, clothing, pose, and position.`;
  }
  if (totalPeopleInImage && totalPeopleInImage > 1) {
    return `SCOPE: Apply the transformation to EVERY SINGLE person visible in the photo — all ${totalPeopleInImage} of them. Not just the most prominent subject; every individual.`;
  }
  return `SCOPE: Apply the transformation to the person in the photo.`;
}

function buildMetaPromptV1(args: ComposeArgs): string {
  const { transformation } = args;
  const scopeLine = buildScopeLine(args.selectedPeopleLabels, args.totalPeopleInImage);
  return [
    `You are writing an image-editing instruction for Nano Banana (a Gemini image-editing model). You will look at the attached photo and produce a single, self-contained prompt that tells the model exactly how to edit it.`,
    ``,
    `TRANSFORMATION INTENT:`,
    transformation,
    ``,
    scopeLine,
    ``,
    `YOUR OUTPUT MUST:`,
    `1. Begin by stating how many people are visible in the photo.`,
    `2. Enumerate each person with a concrete visual descriptor — position in the frame plus distinctive clothing, hair, accessories, pose, or expression. These descriptors are how Nano Banana will identify each individual, so be specific and unambiguous (e.g. "the young man on the far left in the black Miami t-shirt throwing a peace sign").`,
    `3. For each person being transformed, describe the target change while explicitly preserving their pose, expression, vibe, and any unique features (sunglasses, grin, selfie pose, etc.). Clothing must remain the same article but may be re-fit to the new appearance.`,
    `4. Explicitly protect the background, lighting, composition, camera framing, and any visible landmarks. State what must NOT change.`,
    `5. Use plural or enumerated phrasing throughout. Never write "the person" as if there were only one subject when there are multiple. Never let the model default to transforming only the most salient face.`,
    `6. Be written as direct editing instructions TO Nano Banana, in natural prose — not as a description of the task or a meta-explanation.`,
    `7. End with a short line about photorealism (natural skin textures, matching lighting, high detail).`,
    ``,
    `Return ONLY the final prompt text. No preamble. No markdown fences. No meta-commentary. No "Here is the prompt:" prefix. Just the prompt itself, ready to send to Nano Banana.`,
  ].join('\n');
}

function buildMetaPromptV2(args: ComposeArgs): string {
  const { transformation } = args;
  const scopeLine = buildScopeLine(args.selectedPeopleLabels, args.totalPeopleInImage);
  return [
    `You are writing an image-editing instruction for Nano Banana (a Gemini image-editing model). You will look at the attached photo and produce a single, self-contained prompt that tells the model exactly how to edit it.`,
    ``,
    `TRANSFORMATION INTENT:`,
    transformation,
    ``,
    scopeLine,
    ``,
    `YOUR OUTPUT MUST:`,
    `1. Begin with an explicit numbered count and list. Format: "There are N people in this photo. I will now describe each one so you can edit them all:". Then "Person 1 of N: …", "Person 2 of N: …", in strict left-to-right order as they appear in the frame.`,
    `2. For EACH person, provide AT LEAST TWO independent distinguishing anchors. Good anchors: precise spatial position ("the leftmost", "second from the left", "the shortest subject in the front row", "the one partially behind the woman"); unique clothing text/logos; unique accessories (sunglasses, jewellery, headbands); hand position or gesture; approximate age and height relative to others. Weak anchors that are NOT enough on their own: "dark hair", "smiling", "looking at the camera" — these match most people in most photos. If a subject genuinely lacks distinctive features, compensate with multiple spatial anchors ("short child, second from left, in front of the woman, wearing a grey tank top").`,
    `3. For each person being transformed, describe the target change (skin, hair, facial structure as appropriate to the transformation). Preserve their pose and general expression but do NOT over-constrain — phrases like "exact", "identical", "unchanged", "strictly retain", "do not alter any element" make the image model hedge and skip the edit. Prefer softer preservation language: "keep the same pose and vibe", "maintain their smile", "the same clothing item re-fit naturally".`,
    `4. Protect the background, lighting, and framing, but do so in ONE short sentence at the end, not per-person. Over-repeating "do not change" language makes the model refuse.`,
    `5. Use plural or enumerated phrasing throughout. Never write "the person" as if there were only one subject when there are multiple.`,
    `6. End with an explicit verification clause: "Before finishing, confirm that all N people described above have been transformed. The shorter subjects and subjects in the front-center of the frame are the easiest to overlook — they must be transformed too." Then a short photorealism line (natural skin textures, matching lighting, high detail).`,
    `7. Be written as direct editing instructions TO Nano Banana, in natural prose — not as a description of the task or a meta-explanation.`,
    ``,
    `CRITICAL: Image models tend to skip smaller, partially-occluded, or centrally-clustered subjects in multi-person edits. Your numbered list + verification clause is the main defence against that. Do not skip it.`,
    ``,
    `Return ONLY the final prompt text. No preamble. No markdown fences. No meta-commentary. No "Here is the prompt:" prefix. Just the prompt itself, ready to send to Nano Banana.`,
  ].join('\n');
}

function buildMetaPrompt(args: ComposeArgs): { meta: string; variant: MetaVariant } {
  const variant = resolveVariant();
  const meta = variant === 'v1' ? buildMetaPromptV1(args) : buildMetaPromptV2(args);
  return { meta, variant };
}

// Transient failures (Google 503 "Service Unavailable", 429 rate limits,
// brief network hiccups) are very common on the public Gemini endpoints.
// A simple bounded backoff makes the composer path significantly more
// reliable without complicating the happy path. We DON'T retry 4xx errors
// other than 429 — those are programming/config bugs that won't fix
// themselves.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_COMPOSER_ATTEMPTS = 3;

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status != null && RETRYABLE_STATUSES.has(status);
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function composePrompt(args: ComposeArgs): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: COMPOSER_MODEL_ID });

  const { meta, variant } = buildMetaPrompt(args);
  console.log(`[composePrompt] using meta variant: ${variant} | composer model: ${COMPOSER_MODEL_ID}`);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_COMPOSER_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent([
        { inlineData: { mimeType: 'image/jpeg', data: args.imageBase64 } },
        { text: meta },
      ]);

      const text = result.response.text?.();
      if (!text || !text.trim()) {
        throw new Error('Composer returned empty text');
      }

      // Strip any accidental markdown fences — Flash usually obeys the
      // "no fences" instruction but we've seen occasional ```prompt blocks.
      return text
        .replace(/^```(?:prompt|text|markdown)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_COMPOSER_ATTEMPTS) throw err;
      // Exponential backoff with jitter: ~500ms, ~1500ms. Total worst-case
      // added latency when all retries fire: ~2s — tolerable.
      const delay = 500 * attempt + Math.floor(Math.random() * 250);
      console.warn(
        `[composePrompt] attempt ${attempt} failed (${(err as { status?: number })?.status ?? '?'}); retrying in ${delay}ms`,
      );
      await wait(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
