// Publish a "Trending This Week" transformation. Run with:
//
//   cd functions && npm run add-trend
//
// — or directly:
//
//   cd functions && node scripts/add-trend.mjs
//
// Why this file is .mjs and not .ts (which was the original spec):
// Node 22 runs ESM natively, the script is short, and TypeScript would
// add a build step / a `tsx` dev-dep for ~zero safety win on a 60-line
// admin tool. If we ever grow this into a real CLI with subcommands
// and validation, move it into functions/src/scripts/ and let the
// existing tsc pipeline compile it. For now this is intentionally
// minimal.
//
// AUTH — pick one before running:
//   (a) `gcloud auth application-default login`
//       → Application Default Credentials, what I'd recommend for
//         interactive use because nothing lands on disk.
//   (b) Download a service-account JSON from the Firebase console
//       (Project Settings → Service Accounts → Generate new private
//       key), then `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json`
//       before running. Use this in CI / non-interactive environments.
//
// HOW TO PUBLISH A TREND:
//   1. Edit the TREND object below — fill in id, label, emoji,
//      subtitle, promptTemplate (the actual prompt Gemini will run),
//      gradientColors, isPremium, sensitiveCategory.
//   2. Run `npm run add-trend`. The script does a setDoc (merge:false)
//      so re-running with the same id REPLACES the existing trend
//      (intentional — that's how you edit live trends).
//   3. Trend appears in everyone's app within minutes — the home
//      screen does a stale-while-revalidate fetch every mount and
//      pull-to-refresh.
//
// SECURITY NOTES (mirrored in PROJECT_OVERVIEW.md):
//   - `sensitiveCategory: true` triggers the server-side minor-
//     detection gate. Set this whenever the transformation alters
//     someone's identity (race, gender, ethnicity blend, age in a
//     misleading way) or could otherwise look bad on a child's photo.
//   - `isPremium: true` paywalls the trend behind Pro. The server
//     re-checks subscriptionStatus, so a non-Pro client can't sneak
//     past the home-screen gate.
//   - The `promptTemplate` is the canonical prompt the server sends
//     to Gemini. The client receives it (for display only) but never
//     sends it back — the server re-fetches by trendId.

import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { readFileSync } from 'node:fs';

// ─── EDIT THIS BLOCK FOR EACH NEW TREND ──────────────────────────────
//
// `id` must match the regex /^[A-Za-z0-9_-]{1,128}$/ — same charset the
// server-side trend resolver accepts. Keep it short and human-readable.
//
// `gradientColors` becomes a 135° linear-gradient on web; on native it
// falls back to the first color as a flat fill (good enough for now;
// expo-linear-gradient is a future swap). Pick high-contrast colors
// because the card overlays a 28% black scrim for text legibility.
//
// `startDate` / `endDate` accept a Date (UTC) — leave null to publish
// immediately and never auto-expire. The client AND server both apply
// the date-window check so a client with a stale cache can't generate
// against a pulled trend.

const TREND = {
  id: 'example-1970s-disco',
  label: '1970s Disco',
  emoji: '🪩',
  subtitle: 'Bell-bottoms, sequins, full Saturday Night Fever energy.',
  promptTemplate:
    "Edit this photo of a real person. Maintain the exact same pose, expression, and composition. Transform the person to look like they stepped out of a 1970s disco scene: bold sequined outfit, wide-collar shirt or sequined dress, flared bell-bottom pants if applicable, oversized aviator sunglasses or tinted lenses, big '70s hair (afro, feathered, or shag depending on the person), and warm disco-ball lighting with subtle colored gels. Keep the background lightly stylized so the era reads instantly. The edit should look like a natural photorealistic photograph from a 1976 disco club, not AI-generated or cartoonish.",
  gradientColors: ['#7c3aed', '#ec4899'],
  isPremium: false,
  sensitiveCategory: false,
  active: true,
  sortOrder: 10,
  // Optional scheduling window. Examples:
  //   startDate: new Date('2026-06-01T00:00:00Z'),
  //   endDate:   new Date('2026-06-30T23:59:59Z'),
  startDate: null,
  endDate: null,
};

// ─── END EDIT BLOCK ──────────────────────────────────────────────────

function initAdmin() {
  // Prefer GOOGLE_APPLICATION_CREDENTIALS if it points at a real file;
  // fall back to ADC. The console output prints which path we took so
  // it's clear from a single line whether auth resolved.
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    try {
      const json = JSON.parse(readFileSync(credPath, 'utf8'));
      initializeApp({ credential: cert(json) });
      console.log(`[add-trend] auth: service account from ${credPath}`);
      return;
    } catch (e) {
      console.warn(
        `[add-trend] GOOGLE_APPLICATION_CREDENTIALS is set but unreadable; falling back to ADC. Error:`,
        e.message,
      );
    }
  }
  initializeApp({ credential: applicationDefault() });
  console.log('[add-trend] auth: application default credentials');
}

function validateTrend(t) {
  const errors = [];
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(t.id ?? '')) {
    errors.push(`id "${t.id}" must match /^[A-Za-z0-9_-]{1,128}$/`);
  }
  if (typeof t.label !== 'string' || t.label.length < 2) {
    errors.push('label is required and must be a non-trivial string');
  }
  if (typeof t.promptTemplate !== 'string' || t.promptTemplate.length < 20) {
    errors.push('promptTemplate is required and should describe the transformation (≥20 chars)');
  }
  if (!Array.isArray(t.gradientColors) || t.gradientColors.length === 0) {
    errors.push('gradientColors must be a non-empty array of hex strings');
  }
  if (typeof t.sortOrder !== 'number') {
    errors.push('sortOrder must be a number');
  }
  if (errors.length > 0) {
    throw new Error('Invalid trend:\n  - ' + errors.join('\n  - '));
  }
}

async function main() {
  validateTrend(TREND);
  initAdmin();
  const db = getFirestore();

  const docRef = db.collection('trending').doc(TREND.id);
  const existing = await docRef.get();
  const payload = {
    id: TREND.id,
    label: TREND.label,
    emoji: TREND.emoji ?? '✨',
    subtitle: TREND.subtitle ?? '',
    promptTemplate: TREND.promptTemplate,
    gradientColors: TREND.gradientColors,
    isPremium: TREND.isPremium === true,
    sensitiveCategory: TREND.sensitiveCategory === true,
    active: TREND.active !== false,
    sortOrder: Number(TREND.sortOrder) || 0,
    startDate: TREND.startDate ? Timestamp.fromDate(TREND.startDate) : null,
    endDate: TREND.endDate ? Timestamp.fromDate(TREND.endDate) : null,
    // Preserve createdAt across edits — only set on first publish.
    createdAt: existing.exists
      ? existing.data().createdAt ?? Timestamp.now()
      : Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await docRef.set(payload, { merge: false });
  console.log(
    `[add-trend] ${existing.exists ? 'UPDATED' : 'CREATED'} trending/${TREND.id}`,
  );
  console.log('[add-trend] live in clients within ~minutes (next home-screen mount or pull-to-refresh).');
}

main().catch((err) => {
  console.error('[add-trend] failed:', err.message ?? err);
  process.exit(1);
});
