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
    id: 'military-forces',
    label: 'Military & Forces',
    emoji: '🪖',
    description: 'Step into uniform from around the world',
    isPremium: false,
    subcategories: [
      { id: 'us-military', label: 'US Military', promptTemplate: `${BASE} Transform the person to be wearing the US Army Combat Uniform (OCP / Operational Camouflage Pattern) — multi-cam pattern jacket and trousers, US ARMY name tape and a name tape on the chest, the subdued American flag patch on the right sleeve, and a patrol cap with rank insignia. The uniform should read clearly and accurately as modern US Army issue. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'us-police', label: 'US Police', promptTemplate: `${BASE} Transform the person to be wearing a standard American municipal police officer uniform — navy blue or black uniform shirt with shoulder patches and a metal badge over the left chest, dark trousers, a duty belt with holster and radio, and a peaked patrol cap. Should read clearly as US city police (NYPD / LAPD style). Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'british-military', label: 'British Military', promptTemplate: `${BASE} Transform the person to be wearing British Army uniform with MTP (Multi-Terrain Pattern) camouflage — MTP jacket and trousers, the Union Jack flag patch on the upper sleeve, a regimental beret in a recognizable color (sand for SAS, maroon for the Parachute Regiment, or rifleman green for general issue), and British Army insignia. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'british-police', label: 'British Police / Bobby', promptTemplate: `${BASE} Transform the person to be wearing the classic British Metropolitan Police uniform — black tunic with shoulder epaulettes, white shirt and black tie underneath, and the iconic custodian helmet (the tall domed bobby's helmet) with a chrome Metropolitan Police badge. No firearm visible — British police traditionally do not carry. Should read clearly as a traditional London bobby. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'chinese-pla', label: 'Chinese PLA', promptTemplate: `${BASE} Transform the person to be wearing a Chinese People's Liberation Army Type 07 service uniform — olive-green tunic with red collar tabs and gold buttons, red shoulder boards with PLA insignia, and a peaked service cap with a prominent red star and gold trim. Should read clearly as PRC PLA dress uniform. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'japanese-jsdf', label: 'Japanese JSDF', promptTemplate: `${BASE} Transform the person to be wearing the Japan Ground Self-Defense Force (JSDF) uniform — Type 2 camouflage (woodland-style green/brown digital pattern) jacket, JSDF chest patch with the Self-Defense Forces emblem, the Japanese flag patch on the sleeve, and a field cap or beret with the JSDF insignia. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'japanese-samurai', label: 'Japanese Samurai', promptTemplate: `${BASE} Transform the person to be wearing traditional Japanese samurai armor (ō-yoroi or do-maru style) — a lacquered chest plate (dō) in deep red or black, articulated shoulder guards (sode), thigh guards (haidate), a kabuto helmet with a curved maedate forecrest, and a katana sword visible at the hip with a wrapped tsuka handle. Edo or Sengoku-period historical accuracy. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'russian-military', label: 'Russian Military', promptTemplate: `${BASE} Transform the person to be wearing a modern Russian Federation Armed Forces uniform — EMR (Russian digital flora) camouflage jacket and trousers, the Russian tricolor flag patch on the sleeve, a peaked field cap or kepi, and Russian Army insignia. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'soviet-military', label: 'Soviet Red Army', promptTemplate: `${BASE} Transform the person to be wearing a WWII-era Soviet Red Army uniform — an olive-brown gimnastyorka tunic with stand-up collar and breast pockets, a wide brown leather belt with brass buckle, and either a pilotka (forage / side cap) or ushanka (fur hat) with a prominent red star insignia. Should evoke an Eastern Front soldier (1941–1945). Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'french-foreign-legion', label: 'French Foreign Legion', promptTemplate: `${BASE} Transform the person to be wearing the French Foreign Legion's ceremonial parade uniform — the iconic white kepi (képi blanc) with red top, a dark green tunic with red epaulettes (épaulettes de tradition with green wool fringe), and a wide blue sash (ceinture bleue) wrapped around the waist. Should read clearly as Légion étrangère parade dress. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'german-bundeswehr', label: 'German Bundeswehr', promptTemplate: `${BASE} Transform the person to be wearing a modern German Bundeswehr uniform — Flecktarn (German woodland-spotted) camouflage jacket and trousers, the German tricolor (black-red-gold) flag patch on the sleeve, a beret in standard Bundeswehr issue, and Bundeswehr branch insignia. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'korean-military', label: 'South Korean Military', promptTemplate: `${BASE} Transform the person to be wearing a Republic of Korea (ROK) Armed Forces uniform — ROK Army digital camouflage pattern jacket, South Korean Taegukgi flag patch on the sleeve, a beret or field cap with ROK insignia, and ROK Army nameplate over the chest. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'israeli-idf', label: 'Israeli IDF', promptTemplate: `${BASE} Transform the person to be wearing an Israeli Defense Forces (IDF) Class A working uniform — olive-drab service shirt and trousers, IDF rank and branch insignia on the shoulder, a beret folded under the left epaulet (the standard IDF way of carrying a beret on the shoulder when not worn), and the IDF insignia visible. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
      { id: 'swiss-guard', label: 'Vatican Swiss Guard', promptTemplate: `${BASE} Transform the person to be wearing the Pontifical Swiss Guard's ceremonial gala uniform — the distinctive Renaissance-style striped tunic and breeches in vertical bands of blue, red, and yellow (the Medici colors), a white ruffled collar (gorget), and a black morion helmet (combed Spanish-style helmet) topped with a tall red ostrich-feather plume. A halberd (long polearm) optionally visible. Keep the person's face, hair, expression, pose, lighting, and background identical.` },
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
