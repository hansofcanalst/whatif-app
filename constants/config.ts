import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

// IMPORTANT: each EXPO_PUBLIC_* var MUST be referenced via a static property
// access on `process.env` (e.g. `process.env.EXPO_PUBLIC_FOO`) — NOT a
// dynamic bracket access with a variable key. babel-preset-expo (and Metro's
// transform-define plugin) inline these values at bundle time by literal
// text replacement; they cannot follow a `process.env[variableName]`
// indirection. The previous shape — `env('EXPO_PUBLIC_FOO', ...)` helper
// using `process.env[publicKey]` — meant the EXPO_PUBLIC_* values were
// inlined into the Debug bundle (Metro serves process.env at runtime over
// the dev socket) but completely missing from the Release bundle, which
// crashed the app at launch with `auth/invalid-api-key` cascading into
// Hermes GC corruption. See PROGRESS_LOG 2026-05-25. The `extra` fallback
// is a legacy path for values pushed through app.json `extra`; safe because
// it doesn't rely on inlining.
export const config = {
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? extra.FIREBASE_API_KEY ?? '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? extra.FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? extra.FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? extra.FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId:
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? extra.FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? extra.FIREBASE_APP_ID ?? '',
  },
  revenueCat: {
    iosKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? extra.REVENUECAT_API_KEY_IOS ?? '',
    androidKey:
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ?? extra.REVENUECAT_API_KEY_ANDROID ?? '',
  },
  cloudFunctions: {
    baseURL: process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_URL ?? extra.CLOUD_FUNCTIONS_URL ?? '',
  },
  // Sentry DSN. When unset, the Sentry init no-ops cleanly — local dev
  // and contributors without an account see zero impact. Sign up at
  // sentry.io to get a real DSN, then drop it into .env as
  // EXPO_PUBLIC_SENTRY_DSN and restart the dev server (env vars are
  // inlined at build time).
  sentry: {
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? extra.SENTRY_DSN ?? '',
  },
  freeGenerationCap: 3,
  maxImageSize: 1024,
  imageQuality: 0.8,
};

// V1 launch flag — monetization is OFF for the App Store v1 build.
//
// Why: RevenueCat keys (EXPO_PUBLIC_REVENUECAT_API_KEY_IOS /
// EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID) are not yet configured, and
// Apple rejects builds that show a paywall users can't actually
// complete. v1 ships with paywall UI hidden, ethnicity-blend free,
// and no Pro badge anywhere. The RevenueCat SDK, useSubscription
// hook, subscriptionStore, and PaywallModal all remain in the codebase
// and compile cleanly — they just sit dormant.
//
// To re-enable monetization in v1.1:
//   1. Create the RC offering in the RevenueCat dashboard (pro
//      entitlement, weekly/monthly/yearly products).
//   2. Add the two API keys to EAS Secrets:
//        eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value <key> --visibility secret
//        eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value <key> --visibility secret
//   3. Flip V1_MONETIZATION_ENABLED below to true.
//   4. Re-add 'ethnicity-blend' to PREMIUM_CATEGORIES in
//      lib/prompts.ts AND functions/src/prompts.ts.
//   5. Flip `isPremium: true` back on ethnicity-blend in
//      constants/categories.ts.
//   6. Update the snapshot test: `npm run test:update`.
//
// See PROGRESS_LOG.md 2026-05-30 for the full v1 stub rationale.
export const V1_MONETIZATION_ENABLED = false;

export function assertFirebaseConfigured(): void {
  const missing = Object.entries(config.firebase)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    const msg =
      `Firebase is not configured. Missing: ${missing.join(', ')}.\n` +
      `Add EXPO_PUBLIC_FIREBASE_* vars to .env and restart the dev server ` +
      `(env vars are inlined at build time, so you must restart, not just reload).`;
    throw new Error(msg);
  }
}
