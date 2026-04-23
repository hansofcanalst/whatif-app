// Shared prompt catalog — used by both the local dev API route
// (app/api/generate+api.ts) and the production Cloud Function
// (functions/src/prompts.ts). Keep the two files in sync.
//
// This file has no React Native dependencies and is safe to import
// from server-side code (API routes, Cloud Functions).

const BASE = `Edit this photo of a real person. Maintain the exact same pose, expression, lighting, background, and composition. The edit should look like a natural, photorealistic photograph — not AI-generated or cartoonish. Preserve the person's core facial structure and identity as much as possible while applying the following transformation:`;

export interface SubcategoryMeta {
  label: string;
  prompt: string;
}

type CategoryPromptMap = Record<string, Record<string, SubcategoryMeta>>;

export const PROMPTS: CategoryPromptMap = {
  'race-swap': {
    'east-asian': {
      label: 'East Asian',
      prompt: `${BASE} Transform the person to appear of East Asian descent. Adjust skin tone, eye shape, hair color and texture naturally. Keep clothing, accessories, and background identical.`,
    },
    'south-asian': {
      label: 'South Asian',
      prompt: `${BASE} Transform the person to appear of South Asian descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.`,
    },
    black: {
      label: 'Black',
      prompt: `${BASE} Transform the person to appear of Black/African descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.`,
    },
    'white-european': {
      label: 'White/European',
      prompt: `${BASE} Transform the person to appear of White/European descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.`,
    },
    latino: {
      // Latino/Hispanic is phenotypically ambiguous in a way the other
      // race-swap targets are not — it overlaps with Southeast Asian
      // (tan skin, dark hair, dark eyes) and with Mediterranean
      // European. Generic wording like "warm tan skin, dark hair" — the
      // shape earlier versions of this prompt produced — is already
      // true of many source photos, so the image model would barely
      // edit and the result came back looking essentially unchanged.
      //
      // Fix: spell out distinctive mestizo features explicitly, tell
      // the model to shift AWAY from whatever the source is, and gate
      // the edit on the result being *recognizably* Latino rather than
      // "a subtle tan". The composer uses this text as transformation
      // intent, so the more concrete the target description, the more
      // specific the per-person instructions it writes for Nano Banana.
      label: 'Latino',
      prompt: `${BASE} Transform the person so they appear clearly and recognizably of Latino/Hispanic descent — think mestizo Latin American heritage such as Mexican, Colombian, or Peruvian. Shift their features in a direction that is distinctly Latino rather than East/Southeast Asian, Black, or White: warm olive-to-tan skin, dark brown or black hair that often has a wave or slight curl, dark brown eyes, and a mestizo facial bone structure (rounder or slightly broader face, defined cheekbones, warm undertones). The change must be strong enough that a viewer looking only at the edited image would identify the person as Latino without ambiguity — a subtle skin-tone nudge is NOT enough. Keep clothing, accessories, pose, expression, and the background identical.`,
    },
    'middle-eastern': {
      label: 'Middle Eastern',
      prompt: `${BASE} Transform the person to appear of Middle Eastern descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.`,
    },
  },
  'gender-swap': {
    male: {
      label: 'Male',
      prompt: `${BASE} Transform the person to appear as a male version of themselves. Adjust facial structure (jawline, brow), hair, and any visible body features naturally. Adapt clothing style to the new presentation while keeping the same vibe.`,
    },
    female: {
      label: 'Female',
      prompt: `${BASE} Transform the person to appear as a female version of themselves. Adjust facial structure, hair, and any visible features naturally. Adapt clothing style to the new presentation while keeping the same vibe.`,
    },
    androgynous: {
      label: 'Androgynous',
      prompt: `${BASE} Transform the person to appear androgynous. Balance facial features and hair to a neutral presentation.`,
    },
  },
  'age-transform': {
    baby: { label: 'Baby (1yr)', prompt: `${BASE} Transform the person to look like a 1-year-old baby version of themselves. Maintain family resemblance.` },
    child: { label: 'Child (8yr)', prompt: `${BASE} Transform the person to look like an 8-year-old child version of themselves.` },
    teen: { label: 'Teen (16yr)', prompt: `${BASE} Transform the person to look like a 16-year-old teen version of themselves.` },
    'young-adult': { label: 'Young Adult (25yr)', prompt: `${BASE} Transform the person to look like a 25-year-old version of themselves.` },
    'middle-aged': { label: 'Middle Aged (50yr)', prompt: `${BASE} Transform the person to look like a 50-year-old version of themselves with natural aging.` },
    elderly: { label: 'Elderly (80yr)', prompt: `${BASE} Transform the person to look like an 80-year-old version of themselves with natural aging (wrinkles, grey hair, aged skin).` },
  },
  'political-mashup': {
    'trump-child': { label: "Trump's Kid", prompt: `${BASE} Blend this person's features with the Trump family to create a photorealistic Trump-family portrait.` },
    'obama-child': { label: "Obama's Kid", prompt: `${BASE} Blend this person's features with the Obama family to create a photorealistic Obama-family portrait.` },
    'biden-spouse': { label: "Biden's Spouse", prompt: `${BASE} Blend this person's features as a plausible Biden-family spouse. Keep photorealistic.` },
    'aoc-sibling': { label: "AOC's Sibling", prompt: `${BASE} Blend this person's features with Alexandria Ocasio-Cortez's to create a photorealistic sibling portrait.` },
  },
  'celebrity-mashup': {
    'beyonce-child': { label: "Beyoncé's Child", prompt: `${BASE} Blend this person's features with Beyoncé's for a photorealistic child portrait.` },
    'drake-sibling': { label: "Drake's Sibling", prompt: `${BASE} Blend this person's features with Drake's for a photorealistic sibling portrait.` },
    'kardashian-family': { label: 'Kardashian Family', prompt: `${BASE} Blend this person with the Kardashian family aesthetic for a photorealistic family portrait.` },
    'zendaya-twin': { label: "Zendaya's Twin", prompt: `${BASE} Blend this person's features with Zendaya's for a photorealistic twin portrait.` },
  },
  'ethnicity-blend': {
    'half-japanese': { label: 'Half Japanese', prompt: `${BASE} Transform this person to look half Japanese and half their current ethnicity, naturally blended.` },
    'half-nigerian': { label: 'Half Nigerian', prompt: `${BASE} Transform this person to look half Nigerian and half their current ethnicity, naturally blended.` },
    'half-scandinavian': { label: 'Half Scandinavian', prompt: `${BASE} Transform this person to look half Scandinavian and half their current ethnicity, naturally blended.` },
    'half-brazilian': { label: 'Half Brazilian', prompt: `${BASE} Transform this person to look half Brazilian and half their current ethnicity, naturally blended.` },
  },
};

const PREMIUM_CATEGORIES = new Set(['political-mashup', 'celebrity-mashup', 'ethnicity-blend']);

export function getPrompt(category: string, subcategory: string): SubcategoryMeta | null {
  return PROMPTS[category]?.[subcategory] ?? null;
}

export function isPremiumCategory(category: string): boolean {
  return PREMIUM_CATEGORIES.has(category);
}

/**
 * Wraps a base subcategory prompt with multi-person scoping when the image
 * has more than one subject. Nano Banana has no mask/region API, so we steer
 * it with descriptive labels from the detection step.
 *
 * Three cases:
 *  1. 0 or 1 people → return the base prompt unchanged. The singular "the
 *     person" phrasing is correct.
 *  2. 2+ people, user picked a subset → scope to ONLY those people and
 *     instruct the model to leave the others untouched.
 *  3. 2+ people, all selected → scope to ALL N people. This is the case
 *     that used to bail out to the base prompt, which misfired: the base
 *     prompt says "the person" (singular), so the model transformed only
 *     the most prominent subject and left everyone else alone. Now we
 *     explicitly tell the model there are N people and all of them must
 *     receive the transformation.
 *
 * If the caller can't supply `totalPeopleInImage` (detection failed / not
 * run), we fall back to the subset-scoping path whenever labels are
 * present — that's safe because the subset text also lists the people
 * explicitly.
 */
export function buildScopedPrompt(
  basePrompt: string,
  selectedLabels: string[] | undefined,
  totalPeopleInImage: number | undefined,
): string {
  const total = totalPeopleInImage ?? selectedLabels?.length ?? 0;

  // Case 1 — solo subject (or detection didn't find anyone). Original
  // behavior: the singular base prompt is correct.
  if (total <= 1) return basePrompt;

  const hasSelection = selectedLabels && selectedLabels.length > 0;

  // Case 3 — 2+ people, all selected (or no explicit selection but we know
  // the count). Tell the model: transform every one of the N people.
  const allSelected =
    !hasSelection ||
    (totalPeopleInImage != null && selectedLabels!.length >= totalPeopleInImage);
  if (allSelected) {
    const scope =
      `This image contains ${total} people. Apply the transformation to EVERY SINGLE ONE of the ${total} people in the image — not just the most prominent subject, not just the person in the foreground. All ${total} individuals must be transformed.\n\n` +
      `Preserve the full original background, composition, poses, expressions, clothing, and positions. Only the specified transformation should change; every other visual element must remain identical.\n\n` +
      `Transformation to apply to all ${total} people:\n`;
    return `${scope}${basePrompt}`;
  }

  // Case 2 — 2+ people, subset selected. Scope to only the listed people.
  const list = selectedLabels!.map((l) => `- ${l}`).join('\n');
  const scope =
    `This image contains ${total} people. Apply the transformation ONLY to the following person or people:\n${list}\n\n` +
    `CRITICAL: Every other person in the image must be left COMPLETELY UNCHANGED — identical face, skin tone, hair, expression, clothing, pose, and position. Do not edit, retouch, or alter anyone not in the list above. Preserve the full original background and composition.\n\n` +
    `Transformation to apply to the listed person/people only:\n`;
  return `${scope}${basePrompt}`;
}
