// Shared prompt catalog — used by both the local dev API route
// (app/api/generate+api.ts) and the production Cloud Function
// (functions/src/prompts.ts). Keep the two files in sync.
//
// This file has no React Native dependencies and is safe to import
// from server-side code (API routes, Cloud Functions).

const BASE = `Edit this photo of a real person. Maintain the exact same pose, expression, lighting, background, and composition. The edit should look like a natural, photorealistic photograph — not AI-generated or cartoonish. Preserve the person's core facial structure and identity as much as possible while applying the following transformation:`;

/**
 * Optional styling add-on the user can opt into per-variant. Examples:
 * a durag on a Black race-swap, a hijab on a Middle Eastern race-swap.
 *
 * IMPORTANT framing: accessories are user-driven and OPT-IN ONLY. They
 * are never auto-applied based on detected ethnicity. The user picks
 * the variant ("Middle Eastern") and then optionally picks an accessory
 * to layer on top — that's a creative direction the user expresses on
 * their own photo, not a stereotype the app assumes.
 *
 * Snippets are appended to the base subcategory prompt before all the
 * scoping/branching logic, so every prompt path (static, composer,
 * sequential) carries accessories naturally. Each snippet ends with an
 * explicit "replace any existing headwear from the original photo"
 * clause to override the base prompt's "keep accessories identical"
 * preservation language.
 */
export interface Accessory {
  id: string;
  label: string;
  /** Appended verbatim to the base prompt. Should start with a leading space. */
  promptSnippet: string;
}

export interface SubcategoryMeta {
  label: string;
  prompt: string;
  /** Optional opt-in style add-ons. Surfaced in the UI under the variant chip. */
  accessories?: Accessory[];
}

type CategoryPromptMap = Record<string, Record<string, SubcategoryMeta>>;

export const PROMPTS: CategoryPromptMap = {
  // RACE-SWAP PROMPT SHAPE.
  //
  // Every race-swap target follows the same three-part structure:
  //   1. Specific heritage anchors ("think Mexican, Colombian, or Peruvian")
  //      instead of a bare label — gives the image model a concrete look
  //      to shoot for.
  //   2. A "shift AWAY from X, Y, Z" list naming the phenotypes most
  //      likely to overlap with the source photo. This is the part that
  //      fixes the "barely edited" failure mode: earlier generic prompts
  //      ("adjust skin tone and hair naturally") would under-edit when
  //      the source was already phenotypically adjacent (e.g. Southeast
  //      Asian source ↔ Latino target, or Mediterranean European source
  //      ↔ Middle Eastern target), because the model read the source as
  //      "close enough". Naming the neighbors explicitly forces a real
  //      directional edit.
  //   3. A recognizability gate ("a viewer looking only at the edited
  //      image would identify the person as X without ambiguity — a
  //      subtle skin-tone nudge is NOT enough"). Prevents the model from
  //      hedging with a tiny tonal shift.
  //
  // The composer step (see lib/composePrompt.ts) treats this text as
  // transformation intent, so the more concrete the target description,
  // the more specific the per-person instructions it writes for Nano
  // Banana. Keep all six entries written in this same shape.
  'race-swap': {
    'east-asian': {
      label: 'East Asian',
      prompt: `${BASE} Transform the person so they appear clearly and recognizably of East Asian descent — think Chinese, Japanese, or Korean heritage. Shift their features in a direction that is distinctly East Asian rather than Southeast Asian, South Asian, Latino, Black, or White: cool-undertone fair to light-tan skin, straight black or very dark brown hair, eye shape with a defined epicanthic fold, a smaller refined nose with a lower bridge, and smoother less-angular facial bone structure with a softer brow ridge. The change must be strong enough that a viewer looking only at the edited image would identify the person as East Asian without ambiguity — a subtle skin-tone nudge is NOT enough. Keep clothing, accessories, pose, expression, and the background identical.`,
      accessories: [
        {
          id: 'conical-hat',
          label: 'Conical sun hat',
          promptSnippet: ` Additionally, place a traditional East Asian conical straw sun hat (dǒulì / non lá) on the head. The hat must be clearly visible and replaces any existing headwear from the original photo.`,
        },
      ],
    },
    'south-asian': {
      label: 'South Asian',
      prompt: `${BASE} Transform the person so they appear clearly and recognizably of South Asian descent — think Indian, Pakistani, Bangladeshi, or Sri Lankan heritage. Shift their features in a direction that is distinctly South Asian rather than East/Southeast Asian, Middle Eastern, Latino, Black, or White: warm medium-to-deep brown skin with golden undertones, very dark thick hair that is often wavy, deep brown eyes under thicker eyebrows, a pronounced brow ridge and defined nose bridge, and strong cheekbones. The change must be strong enough that a viewer looking only at the edited image would identify the person as South Asian without ambiguity — a subtle skin-tone nudge is NOT enough. Keep clothing, accessories, pose, expression, and the background identical.`,
      accessories: [
        {
          id: 'turban-sikh',
          label: 'Sikh Turban',
          promptSnippet: ` Additionally, add a neatly wrapped Sikh dastaar (turban) on the head in a solid color such as orange, navy blue, or black. The turban must be clearly visible and replaces any existing headwear from the original photo.`,
        },
        {
          id: 'bindi',
          label: 'Bindi',
          promptSnippet: ` Additionally, add a small decorative bindi (a colored or jeweled dot) centered on the forehead between the eyebrows, in the traditional South Asian style. The bindi must be clearly visible.`,
        },
      ],
    },
    black: {
      label: 'Black',
      prompt: `${BASE} Transform the person so they appear clearly and recognizably of Black/African descent. Shift their features in a direction that is distinctly Black rather than East/Southeast Asian, South Asian, Latino, Middle Eastern, or White: warm medium-brown to deep-brown skin, tightly coiled or curly natural hair texture (or an equivalently Black hairstyle that matches the original cut length), fuller lips, a broader nose with a more rounded tip, and warm undertones. The change must be strong enough that a viewer looking only at the edited image would identify the person as Black/African-descended without ambiguity — a subtle skin-tone nudge is NOT enough. Keep clothing, accessories, pose, expression, and the background identical.`,
      accessories: [
        {
          id: 'durag',
          label: 'Durag',
          promptSnippet: ` Additionally, place a black silk durag tied snugly around the head in the traditional style, with the long ties hanging down the back. The durag must be clearly visible and replaces any existing headwear from the original photo.`,
        },
        {
          id: 'headwrap',
          label: 'Headwrap',
          promptSnippet: ` Additionally, add a colorful patterned African-style headwrap (gele) tied around the head. The headwrap must be clearly visible and replaces any existing headwear from the original photo.`,
        },
      ],
    },
    'white-european': {
      label: 'White/European',
      prompt: `${BASE} Transform the person so they appear clearly and recognizably of White/European descent — think Northern or Central European heritage such as British, German, Scandinavian, or Slavic. Shift their features in a direction that is distinctly White rather than East/Southeast Asian, South Asian, Middle Eastern, Latino, or Black: fair skin with pink or peach undertones, hair in the blond, light-brown, auburn, or medium-brown range (not jet black), lighter eye color where plausible (blue, green, hazel, or light brown), a narrower nose with a defined bridge, more angular European facial structure, and cool skin undertones. The change must be strong enough that a viewer looking only at the edited image would identify the person as White/European without ambiguity — a subtle skin-tone nudge is NOT enough. Keep clothing, accessories, pose, expression, and the background identical.`,
      accessories: [
        {
          id: 'cowboy-hat',
          label: 'Cowboy hat',
          promptSnippet: ` Additionally, place a classic brown leather cowboy hat with a curled brim on the head. The hat must be clearly visible and replaces any existing headwear from the original photo.`,
        },
        {
          id: 'beanie',
          label: 'Beanie',
          promptSnippet: ` Additionally, place a knitted beanie on the head in a neutral color (charcoal, black, or oatmeal) that suits the person. The beanie must be clearly visible and replaces any existing headwear from the original photo.`,
        },
        {
          id: 'newsboy-cap',
          label: 'Newsboy cap',
          promptSnippet: ` Additionally, place a tweed newsboy cap (flat cap) on the head in a brown or grey herringbone pattern. The cap must be clearly visible and replaces any existing headwear from the original photo.`,
        },
        {
          id: 'yamaka',
          label: 'Yamaka',
          promptSnippet: ` Additionally, place a small kippah (yamaka) on the crown of the head in a solid color such as black, navy, or maroon. The kippah must be clearly visible (sitting on top of the hair, not replacing it) and is in addition to the original hairstyle.`,
        },
      ],
    },
    latino: {
      label: 'Latino',
      prompt: `${BASE} Transform the person so they appear clearly and recognizably of Latino/Hispanic descent — think mestizo Latin American heritage such as Mexican, Colombian, or Peruvian. Shift their features in a direction that is distinctly Latino rather than East/Southeast Asian, South Asian, Middle Eastern, Black, or White: warm olive-to-tan skin, dark brown or black hair that often has a wave or slight curl, dark brown eyes, and a mestizo facial bone structure (rounder or slightly broader face, defined cheekbones, warm undertones). The change must be strong enough that a viewer looking only at the edited image would identify the person as Latino without ambiguity — a subtle skin-tone nudge is NOT enough. Keep clothing, accessories, pose, expression, and the background identical.`,
      accessories: [
        {
          id: 'sombrero',
          label: 'Sombrero',
          promptSnippet: ` Additionally, place a traditional wide-brimmed Mexican sombrero on the head with decorative trim around the brim. The sombrero must be clearly visible and replaces any existing headwear from the original photo.`,
        },
        {
          id: 'charro-hat',
          label: 'Charro hat',
          promptSnippet: ` Additionally, place a traditional Mexican charro hat (sombrero charro) on the head — a stiff felt hat with a wide flat brim and ornate embroidery. The hat must be clearly visible and replaces any existing headwear from the original photo.`,
        },
      ],
    },
    'middle-eastern': {
      label: 'Middle Eastern',
      prompt: `${BASE} Transform the person so they appear clearly and recognizably of Middle Eastern descent — think Arab, Persian, Turkish, or Levantine heritage such as Lebanese, Iranian, or Egyptian. Shift their features in a direction that is distinctly Middle Eastern rather than East/Southeast Asian, South Asian, Latino, Black, or European: warm olive to medium-brown skin, thick dark wavy or curly hair, dark brown eyes under thick full brows, a strong defined brow ridge and nose bridge, and warm undertones. The change must be strong enough that a viewer looking only at the edited image would identify the person as Middle Eastern without ambiguity — a subtle skin-tone nudge is NOT enough. Keep clothing, accessories, pose, expression, and the background identical.`,
      accessories: [
        {
          id: 'hijab',
          label: 'Hijab',
          promptSnippet: ` Additionally, drape a hijab head covering naturally and modestly around the head, framing the face. The hijab must be clearly visible and replaces any existing headwear from the original photo.`,
        },
        {
          id: 'keffiyeh',
          label: 'Keffiyeh',
          promptSnippet: ` Additionally, drape a traditional checkered keffiyeh (black-and-white or red-and-white) over the head and shoulders in the traditional Arab style. The keffiyeh must be clearly visible and replaces any existing headwear from the original photo.`,
        },
      ],
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
    baby: {
      label: 'Baby (1yr)',
      prompt: `${BASE} Transform the person to look like a 1-year-old baby version of themselves. Maintain family resemblance.`,
      accessories: [
        {
          id: 'pacifier',
          label: 'Pacifier',
          promptSnippet: ` Additionally, the baby should have a pacifier in their mouth in a soft pastel color (white, blue, or pink). The pacifier must be clearly visible.`,
        },
      ],
    },
    child: { label: 'Child (8yr)', prompt: `${BASE} Transform the person to look like an 8-year-old child version of themselves.` },
    teen: { label: 'Teen (16yr)', prompt: `${BASE} Transform the person to look like a 16-year-old teen version of themselves.` },
    'young-adult': { label: 'Young Adult (25yr)', prompt: `${BASE} Transform the person to look like a 25-year-old version of themselves.` },
    'middle-aged': {
      label: 'Middle Aged (50yr)',
      prompt: `${BASE} Transform the person to look like a 50-year-old version of themselves with natural aging.`,
      accessories: [
        {
          id: 'reading-glasses',
          label: 'Reading glasses',
          promptSnippet: ` Additionally, add a pair of subtle reading glasses on the face in a frame style that suits the person.`,
        },
      ],
    },
    elderly: {
      label: 'Elderly (80yr)',
      prompt: `${BASE} Transform the person to look like an 80-year-old version of themselves with natural aging (wrinkles, grey hair, aged skin).`,
      accessories: [
        {
          id: 'reading-glasses',
          label: 'Reading glasses',
          promptSnippet: ` Additionally, add a pair of reading glasses on the face in a frame style that suits an elderly person.`,
        },
        {
          id: 'cane',
          label: 'Walking cane',
          promptSnippet: ` Additionally, the elderly person should be holding a wooden walking cane in their hand. The cane must be clearly visible.`,
        },
      ],
    },
  },
  'military-forces': {
    'us-military': {
      label: 'US Military',
      prompt: `${BASE} Transform the person to be wearing the US Army Combat Uniform (OCP / Operational Camouflage Pattern) — multi-cam pattern jacket and trousers, US ARMY name tape and a name tape on the chest, the subdued American flag patch on the right sleeve, and a patrol cap with rank insignia. The uniform should read clearly and accurately as modern US Army issue. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'us-police': {
      label: 'US Police',
      prompt: `${BASE} Transform the person to be wearing a standard American municipal police officer uniform — navy blue or black uniform shirt with shoulder patches and a metal badge over the left chest, dark trousers, a duty belt with holster and radio, and a peaked patrol cap. Should read clearly as US city police (NYPD / LAPD style). Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'british-military': {
      label: 'British Military',
      prompt: `${BASE} Transform the person to be wearing British Army uniform with MTP (Multi-Terrain Pattern) camouflage — MTP jacket and trousers, the Union Jack flag patch on the upper sleeve, a regimental beret in a recognizable color (sand for SAS, maroon for the Parachute Regiment, or rifleman green for general issue), and British Army insignia. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'british-police': {
      label: 'British Police / Bobby',
      prompt: `${BASE} Transform the person to be wearing the classic British Metropolitan Police uniform — black tunic with shoulder epaulettes, white shirt and black tie underneath, and the iconic custodian helmet (the tall domed bobby's helmet) with a chrome Metropolitan Police badge. No firearm visible — British police traditionally do not carry. Should read clearly as a traditional London bobby. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'chinese-pla': {
      label: 'Chinese PLA',
      prompt: `${BASE} Transform the person to be wearing a Chinese People's Liberation Army Type 07 service uniform — olive-green tunic with red collar tabs and gold buttons, red shoulder boards with PLA insignia, and a peaked service cap with a prominent red star and gold trim. Should read clearly as PRC PLA dress uniform. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'japanese-jsdf': {
      label: 'Japanese JSDF',
      prompt: `${BASE} Transform the person to be wearing the Japan Ground Self-Defense Force (JSDF) uniform — Type 2 camouflage (woodland-style green/brown digital pattern) jacket, JSDF chest patch with the Self-Defense Forces emblem, the Japanese flag patch on the sleeve, and a field cap or beret with the JSDF insignia. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'japanese-samurai': {
      label: 'Japanese Samurai',
      prompt: `${BASE} Transform the person to be wearing traditional Japanese samurai armor (ō-yoroi or do-maru style) — a lacquered chest plate (dō) in deep red or black, articulated shoulder guards (sode), thigh guards (haidate), a kabuto helmet with a curved maedate forecrest, and a katana sword visible at the hip with a wrapped tsuka handle. Edo or Sengoku-period historical accuracy. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'russian-military': {
      label: 'Russian Military',
      prompt: `${BASE} Transform the person to be wearing a modern Russian Federation Armed Forces uniform — EMR (Russian digital flora) camouflage jacket and trousers, the Russian tricolor flag patch on the sleeve, a peaked field cap or kepi, and Russian Army insignia. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'soviet-military': {
      label: 'Soviet Red Army',
      prompt: `${BASE} Transform the person to be wearing a WWII-era Soviet Red Army uniform — an olive-brown gimnastyorka tunic with stand-up collar and breast pockets, a wide brown leather belt with brass buckle, and either a pilotka (forage / side cap) or ushanka (fur hat) with a prominent red star insignia. Should evoke an Eastern Front soldier (1941–1945). Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'french-foreign-legion': {
      label: 'French Foreign Legion',
      prompt: `${BASE} Transform the person to be wearing the French Foreign Legion's ceremonial parade uniform — the iconic white kepi (képi blanc) with red top, a dark green tunic with red epaulettes (épaulettes de tradition with green wool fringe), and a wide blue sash (ceinture bleue) wrapped around the waist. Should read clearly as Légion étrangère parade dress. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'german-bundeswehr': {
      label: 'German Bundeswehr',
      prompt: `${BASE} Transform the person to be wearing a modern German Bundeswehr uniform — Flecktarn (German woodland-spotted) camouflage jacket and trousers, the German tricolor (black-red-gold) flag patch on the sleeve, a beret in standard Bundeswehr issue, and Bundeswehr branch insignia. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'korean-military': {
      label: 'South Korean Military',
      prompt: `${BASE} Transform the person to be wearing a Republic of Korea (ROK) Armed Forces uniform — ROK Army digital camouflage pattern jacket, South Korean Taegukgi flag patch on the sleeve, a beret or field cap with ROK insignia, and ROK Army nameplate over the chest. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'israeli-idf': {
      label: 'Israeli IDF',
      prompt: `${BASE} Transform the person to be wearing an Israeli Defense Forces (IDF) Class A working uniform — olive-drab service shirt and trousers, IDF rank and branch insignia on the shoulder, a beret folded under the left epaulet (the standard IDF way of carrying a beret on the shoulder when not worn), and the IDF insignia visible. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
    'swiss-guard': {
      label: 'Vatican Swiss Guard',
      prompt: `${BASE} Transform the person to be wearing the Pontifical Swiss Guard's ceremonial gala uniform — the distinctive Renaissance-style striped tunic and breeches in vertical bands of blue, red, and yellow (the Medici colors), a white ruffled collar (gorget), and a black morion helmet (combed Spanish-style helmet) topped with a tall red ostrich-feather plume. A halberd (long polearm) optionally visible. Keep the person's face, hair, expression, pose, lighting, and background identical.`,
    },
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

/**
 * Resolve a list of accessory ids (from the user's selection on the
 * category screen) into the concatenated prompt snippets that should be
 * appended to the base prompt. Unknown ids are silently skipped — the
 * server doesn't trust the client to send only valid ids.
 *
 * Returns '' when the user picked no accessories or the subcategory has
 * none defined; callers can `meta.prompt + appendAccessoryPrompt(...)`
 * unconditionally.
 */
export function appendAccessoryPrompt(
  category: string,
  subcategory: string,
  accessoryIds: string[] | undefined,
): string {
  if (!accessoryIds?.length) return '';
  const meta = getPrompt(category, subcategory);
  if (!meta?.accessories?.length) return '';
  const byId = new Map(meta.accessories.map((a) => [a.id, a]));
  return accessoryIds
    .map((id) => byId.get(id)?.promptSnippet ?? '')
    .filter((s) => s.length > 0)
    .join('');
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
