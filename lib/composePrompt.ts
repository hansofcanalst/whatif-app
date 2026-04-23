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

  // Strip any accidental markdown fences — Flash usually obeys the
  // "no fences" instruction but we've seen occasional ```prompt blocks.
  return text
    .replace(/^```(?:prompt|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}
