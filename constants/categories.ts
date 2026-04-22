export interface Subcategory {
  id: string;
  label: string;
  promptTemplate: string;
}

export interface Category {
  id: string;
  label: string;
  emoji: string;
  description: string;
  isPremium: boolean;
  subcategories: Subcategory[];
}

const BASE = `Edit this photo of a real person. Maintain the exact same pose, expression, lighting, background, and composition. The edit should look like a natural, photorealistic photograph — not AI-generated or cartoonish. Preserve the person's core facial structure and identity as much as possible while applying the following transformation:`;

export const CATEGORIES: Category[] = [
  {
    id: 'race-swap',
    label: 'Race Swap',
    emoji: '🌍',
    description: 'See yourself as a different race',
    isPremium: false,
    subcategories: [
      { id: 'east-asian', label: 'East Asian', promptTemplate: `${BASE} Transform the person to appear of East Asian descent. Adjust skin tone, eye shape, hair color and texture naturally. Keep clothing, accessories, and background identical.` },
      { id: 'south-asian', label: 'South Asian', promptTemplate: `${BASE} Transform the person to appear of South Asian descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.` },
      { id: 'black', label: 'Black', promptTemplate: `${BASE} Transform the person to appear of Black/African descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.` },
      { id: 'white-european', label: 'White/European', promptTemplate: `${BASE} Transform the person to appear of White/European descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.` },
      { id: 'latino', label: 'Latino', promptTemplate: `${BASE} Transform the person to appear of Latino/Hispanic descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.` },
      { id: 'middle-eastern', label: 'Middle Eastern', promptTemplate: `${BASE} Transform the person to appear of Middle Eastern descent. Adjust skin tone, facial features, hair color and texture naturally. Keep clothing, accessories, and background identical.` },
    ],
  },
  {
    id: 'gender-swap',
    label: 'Gender Swap',
    emoji: '🔄',
    description: 'What if you were a different gender?',
    isPremium: false,
    subcategories: [
      { id: 'male', label: 'Male', promptTemplate: `${BASE} Transform the person to appear as a male version of themselves. Adjust facial structure (jawline, brow), hair, and any visible body features naturally. Adapt clothing style to the new presentation while keeping the same vibe.` },
      { id: 'female', label: 'Female', promptTemplate: `${BASE} Transform the person to appear as a female version of themselves. Adjust facial structure, hair, and any visible features naturally. Adapt clothing style to the new presentation while keeping the same vibe.` },
      { id: 'androgynous', label: 'Androgynous', promptTemplate: `${BASE} Transform the person to appear androgynous — neither distinctly masculine nor feminine. Balance facial features and hair to a neutral presentation.` },
    ],
  },
  {
    id: 'age-transform',
    label: 'Age Machine',
    emoji: '⏳',
    description: 'Travel through time',
    isPremium: false,
    subcategories: [
      { id: 'baby', label: 'Baby (1yr)', promptTemplate: `${BASE} Transform the person to look like a 1-year-old baby version of themselves. Maintain recognizable family resemblance in features. Show as a natural baby photo.` },
      { id: 'child', label: 'Child (8yr)', promptTemplate: `${BASE} Transform the person to look like an 8-year-old child version of themselves. Maintain facial resemblance while clearly showing a child's proportions and features.` },
      { id: 'teen', label: 'Teen (16yr)', promptTemplate: `${BASE} Transform the person to look like a 16-year-old teen version of themselves. Younger skin, less defined features, teen-appropriate styling.` },
      { id: 'young-adult', label: 'Young Adult (25yr)', promptTemplate: `${BASE} Transform the person to look like a 25-year-old young adult version of themselves. Fresh, youthful skin while keeping identity intact.` },
      { id: 'middle-aged', label: 'Middle Aged (50yr)', promptTemplate: `${BASE} Transform the person to look like a 50-year-old version of themselves. Add natural aging: slight wrinkles, mature skin, some grey hair if applicable.` },
      { id: 'elderly', label: 'Elderly (80yr)', promptTemplate: `${BASE} Transform the person to look like an 80-year-old version of themselves. Add natural aging: wrinkles, grey/white hair, aged skin texture. Maintain their core identity and expression.` },
    ],
  },
  {
    id: 'political-mashup',
    label: 'Political Mashup',
    emoji: '🏛️',
    description: "What if you were a political figure's family?",
    isPremium: true,
    subcategories: [
      { id: 'trump-child', label: "Trump's Kid", promptTemplate: `${BASE} Blend this person's features with those of the Trump family to create a photorealistic image of what they might look like as a Trump family member. Blend facial features naturally while maintaining some of the original person's characteristics.` },
      { id: 'obama-child', label: "Obama's Kid", promptTemplate: `${BASE} Blend this person's features with those of the Obama family to create a photorealistic image of what they might look like as an Obama family member. Blend facial features naturally.` },
      { id: 'biden-spouse', label: "Biden's Spouse", promptTemplate: `${BASE} Blend this person's features to appear as a plausible spouse/partner in the Biden family. Keep the blend tasteful and photorealistic.` },
      { id: 'aoc-sibling', label: "AOC's Sibling", promptTemplate: `${BASE} Blend this person's features with Alexandria Ocasio-Cortez's features to create a photorealistic image of what they might look like as her sibling.` },
    ],
  },
  {
    id: 'celebrity-mashup',
    label: 'Celebrity Mashup',
    emoji: '⭐',
    description: 'What if you were related to a celebrity?',
    isPremium: true,
    subcategories: [
      { id: 'beyonce-child', label: "Beyoncé's Child", promptTemplate: `${BASE} Blend this person's features with Beyoncé's features to create a photorealistic image of what they might look like if Beyoncé were their parent.` },
      { id: 'drake-sibling', label: "Drake's Sibling", promptTemplate: `${BASE} Blend this person's features with Drake's features to create a photorealistic image of what they might look like as Drake's sibling.` },
      { id: 'kardashian-family', label: 'Kardashian Family', promptTemplate: `${BASE} Blend this person's features with the Kardashian family aesthetic to create a photorealistic image of what they might look like as a member of the family.` },
      { id: 'zendaya-twin', label: "Zendaya's Twin", promptTemplate: `${BASE} Blend this person's features with Zendaya's features to create a photorealistic image of what they might look like as her twin.` },
    ],
  },
  {
    id: 'ethnicity-blend',
    label: 'Ethnicity Blend',
    emoji: '🧬',
    description: 'What if your heritage was mixed?',
    isPremium: true,
    subcategories: [
      { id: 'half-japanese', label: 'Half Japanese', promptTemplate: `${BASE} Transform this person to look like they are half Japanese and half their current ethnicity. Blend features naturally — this should look like a real person of mixed Japanese heritage.` },
      { id: 'half-nigerian', label: 'Half Nigerian', promptTemplate: `${BASE} Transform this person to look like they are half Nigerian and half their current ethnicity. Blend features naturally.` },
      { id: 'half-scandinavian', label: 'Half Scandinavian', promptTemplate: `${BASE} Transform this person to look like they are half Scandinavian and half their current ethnicity. Blend features naturally.` },
      { id: 'half-brazilian', label: 'Half Brazilian', promptTemplate: `${BASE} Transform this person to look like they are half Brazilian and half their current ethnicity. Blend features naturally.` },
    ],
  },
];

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function getSubcategory(categoryId: string, subcategoryId: string): Subcategory | undefined {
  return getCategory(categoryId)?.subcategories.find((s) => s.id === subcategoryId);
}
