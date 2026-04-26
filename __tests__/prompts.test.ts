// Snapshot tests for the prompt-pipeline surface in lib/prompts.ts.
//
// Goal: catch accidental edits to the prompt text, accessory snippets,
// or scoping logic. The prompt text IS the product as much as the code
// is — a stray comma added during a refactor can degrade output across
// every variant. Snapshots make that diff visible at PR time.
//
// What's covered:
//   - getPrompt(category, subcategory) for every (category, sub) combo
//   - SubcategoryMeta shape (label + prompt + accessories[])
//   - appendAccessoryPrompt for every defined accessory
//   - buildScopedPrompt across all three branches (solo / all-selected /
//     subset)
//   - Defensive behavior (unknown ids, missing accessories)
//
// What's NOT covered:
//   - composePrompt (lib/composePrompt.ts) — that calls Gemini and is
//     non-deterministic, snapshot tests don't fit
//   - Server-side mirror in functions/src/prompts.ts — kept-in-sync by
//     convention; if drift becomes a problem, add a parallel test file
//     in functions/__tests__/

import {
  PROMPTS,
  getPrompt,
  appendAccessoryPrompt,
  buildScopedPrompt,
  isPremiumCategory,
} from '@/lib/prompts';

describe('PROMPTS catalog', () => {
  test('full snapshot of every category × subcategory', () => {
    expect(PROMPTS).toMatchSnapshot();
  });

  test('every subcategory has a non-empty label and prompt', () => {
    // Cheap structural check — catches a future contributor accidentally
    // shipping `prompt: ''` or forgetting the label. Snapshot would also
    // catch this but the failure message would be less obvious.
    for (const [catId, subs] of Object.entries(PROMPTS)) {
      for (const [subId, meta] of Object.entries(subs)) {
        expect(meta.label.length).toBeGreaterThan(0);
        expect(meta.prompt.length).toBeGreaterThan(0);
        // Every prompt should anchor in the BASE preamble — that's what
        // gives us "photorealistic, preserve identity" framing across
        // every transformation. If a prompt drops it, we want to know.
        expect(meta.prompt).toContain('Edit this photo of a real person');
        // Sanity: catId and subId reference don't mismatch keys.
        expect(getPrompt(catId, subId)).toBe(meta);
      }
    }
  });
});

describe('getPrompt', () => {
  test('returns null for unknown category', () => {
    expect(getPrompt('not-a-category', 'whatever')).toBeNull();
  });

  test('returns null for unknown subcategory under a known category', () => {
    expect(getPrompt('race-swap', 'klingon')).toBeNull();
  });

  test('returns the meta for a valid pair', () => {
    const meta = getPrompt('race-swap', 'black');
    expect(meta).not.toBeNull();
    expect(meta!.label).toBe('Black');
  });
});

describe('appendAccessoryPrompt', () => {
  test('returns empty string when no ids passed', () => {
    expect(appendAccessoryPrompt('race-swap', 'black', undefined)).toBe('');
    expect(appendAccessoryPrompt('race-swap', 'black', [])).toBe('');
  });

  test('returns empty string when subcategory has no accessories defined', () => {
    // gender-swap variants have no accessories yet.
    expect(appendAccessoryPrompt('gender-swap', 'male', ['durag'])).toBe('');
  });

  test('silently skips unknown accessory ids', () => {
    // The server doesn't trust the client to send only valid ids.
    // Unknown ids drop out without throwing or polluting the prompt.
    const out = appendAccessoryPrompt('race-swap', 'black', ['not-real']);
    expect(out).toBe('');
  });

  test('combines a known + unknown id, keeping only the known one', () => {
    const out = appendAccessoryPrompt('race-swap', 'black', ['durag', 'not-real']);
    // Should equal the durag snippet alone.
    const durag = getPrompt('race-swap', 'black')!.accessories!.find(
      (a) => a.id === 'durag',
    )!;
    expect(out).toBe(durag.promptSnippet);
  });

  test('snapshot of every accessory snippet across the catalog', () => {
    // Build a flat record of `categoryId/subId/accId → resolved snippet`.
    // Locks every individual accessory string against unintended edits.
    const flat: Record<string, string> = {};
    for (const [catId, subs] of Object.entries(PROMPTS)) {
      for (const [subId, meta] of Object.entries(subs)) {
        for (const acc of meta.accessories ?? []) {
          flat[`${catId}/${subId}/${acc.id}`] = appendAccessoryPrompt(
            catId,
            subId,
            [acc.id],
          );
        }
      }
    }
    expect(flat).toMatchSnapshot();
  });

  test('multiple accessories concatenate in input order', () => {
    const meta = getPrompt('race-swap', 'middle-eastern')!;
    const ids = meta.accessories!.map((a) => a.id);
    const out = appendAccessoryPrompt('race-swap', 'middle-eastern', ids);
    const expected = meta.accessories!.map((a) => a.promptSnippet).join('');
    expect(out).toBe(expected);
  });
});

describe('buildScopedPrompt', () => {
  const BASE_FIXTURE = 'BASE_PROMPT_TEXT';

  test('returns base unchanged for solo subject (no labels, no count)', () => {
    expect(buildScopedPrompt(BASE_FIXTURE, undefined, undefined)).toBe(BASE_FIXTURE);
  });

  test('returns base unchanged for solo subject (count = 1)', () => {
    expect(buildScopedPrompt(BASE_FIXTURE, undefined, 1)).toBe(BASE_FIXTURE);
    expect(buildScopedPrompt(BASE_FIXTURE, ['Alice'], 1)).toBe(BASE_FIXTURE);
  });

  test('all-selected branch (count = N, labels.length = N) — snapshot', () => {
    const out = buildScopedPrompt(
      BASE_FIXTURE,
      ['the man on the left', 'the woman in the middle', 'the boy on the right'],
      3,
    );
    expect(out).toMatchSnapshot();
  });

  test('all-selected branch (no labels, count > 1) — snapshot', () => {
    // The "all" branch also fires when labels are absent but the count
    // tells us there are multiple people. This was the case the original
    // base-prompt fallback got wrong.
    expect(buildScopedPrompt(BASE_FIXTURE, undefined, 4)).toMatchSnapshot();
    expect(buildScopedPrompt(BASE_FIXTURE, [], 4)).toMatchSnapshot();
  });

  test('subset-selected branch — snapshot', () => {
    const out = buildScopedPrompt(
      BASE_FIXTURE,
      ['the woman in the red shirt'],
      4,
    );
    expect(out).toMatchSnapshot();
  });

  test('subset branch lists every selected label as a bullet', () => {
    const out = buildScopedPrompt(
      BASE_FIXTURE,
      ['Alice', 'Bob'],
      5,
    );
    expect(out).toContain('- Alice');
    expect(out).toContain('- Bob');
  });
});

describe('isPremiumCategory', () => {
  test('snapshot of premium membership across the catalog', () => {
    const flags: Record<string, boolean> = {};
    for (const catId of Object.keys(PROMPTS)) {
      flags[catId] = isPremiumCategory(catId);
    }
    expect(flags).toMatchSnapshot();
  });

  test('returns false for unknown category', () => {
    expect(isPremiumCategory('not-real')).toBe(false);
  });
});
