// Cloud Function mirror of lib/composePrompt.ts. Keep in sync.
//
// Two-stage pipeline: Gemini Flash composes a per-person enumerated edit
// prompt from the actual image + the transformation intent; Nano Banana
// then executes it. See lib/composePrompt.ts for the full rationale.

import * as functions from 'firebase-functions';
import { GoogleGenerativeAI } from '@google/generative-ai';

const COMPOSER_MODEL_ID =
  process.env.GEMINI_COMPOSER_MODEL || 'gemini-2.5-flash';

export interface ComposeArgs {
  imageBase64: string;
  transformation: string;
  selectedPeopleLabels?: string[];
  totalPeopleInImage?: number;
}

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(key);
}

function buildMetaPrompt(args: ComposeArgs): string {
  const { transformation, selectedPeopleLabels, totalPeopleInImage } = args;

  const hasSubset =
    selectedPeopleLabels &&
    selectedPeopleLabels.length > 0 &&
    totalPeopleInImage != null &&
    selectedPeopleLabels.length < totalPeopleInImage;

  const scopeLine = hasSubset
    ? `SCOPE: Apply the transformation ONLY to these specific people: ${selectedPeopleLabels!
        .map((l) => `"${l}"`)
        .join(', ')}. Every other person in the photo must remain COMPLETELY UNCHANGED — identical face, skin, hair, expression, clothing, pose, and position.`
    : totalPeopleInImage && totalPeopleInImage > 1
      ? `SCOPE: Apply the transformation to EVERY SINGLE person visible in the photo — all ${totalPeopleInImage} of them. Not just the most prominent subject; every individual.`
      : `SCOPE: Apply the transformation to the person in the photo.`;

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

export async function composePrompt(args: ComposeArgs): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: COMPOSER_MODEL_ID });

  const meta = buildMetaPrompt(args);

  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/jpeg', data: args.imageBase64 } },
    { text: meta },
  ]);

  const text = result.response.text?.();
  if (!text || !text.trim()) {
    throw new Error('Composer returned empty text');
  }

  return text
    .replace(/^```(?:prompt|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}
