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
      label: 'Latino',
      prompt: `${BASE} Transform the person to appear of Latino/Hispanic descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.`,
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
