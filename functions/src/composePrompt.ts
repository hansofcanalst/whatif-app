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
