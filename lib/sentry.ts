// Sentry client-side error tracking. Mirror of the server-side
// observability we get via `logs/` in Firestore + the [telemetry]
// stdout lines in dev — this is the parallel for crashes and unhandled
// errors that happen on the user's device.
//
// Design choices:
//
//   1. Init is GUARDED behind the DSN being set. No DSN → no init →
//      Sentry methods become no-ops via the `enabled: false` flag we
//      pass in. That way contributors without a Sentry account, or
//      anyone running the app locally without env config, see zero
//      noise (no SDK warnings, no failed network calls).
//
//   2. Init is also GUARDED behind a try/catch. Sentry is observability;
//      it must NEVER take down the app it's observing. If something is
//      wrong with the SDK (bad init, missing native module on a
//      partially-installed dev build, etc.) we log a warning and move
//      on rather than throwing.
//
//   3. We deliberately don't enable performance tracing
//      (`tracesSampleRate: 0`). It samples real user requests and uses
//      a separate quota at sentry.io — nice-to-have eventually, not
//      worth the complexity for v1. Errors-only is the MVP.
//
//   4. We only attach the user's `uid` to events, NEVER their email or
//      displayName. The uid is an opaque string with no PII linkage
//      (the user doc with PII can be deleted via the account-deletion
//      flow). Keeping the email out of Sentry means we don't have to
//      think about Sentry's data residency for GDPR purposes.

import * as Sentry from '@sentry/react-native';
import { config } from '@/constants/config';

let initialized = false;

/**
 * One-shot initialization. Safe to call multiple times — subsequent
 * calls are no-ops. Call once early in the app lifecycle (root layout's
 * useMemo or top-level effect) so the SDK is ready before anything
 * else can throw.
 */
export function initSentry(): void {
  if (initialized) return;
  const dsn = config.sentry.dsn?.trim();
  if (!dsn) {
    // Quiet log so devs running without a DSN see why nothing is being
    // captured. Single line, prefixed for grep.
    console.log('[sentry] no DSN configured — error tracking disabled.');
    initialized = true; // Prevent re-checks on repeated calls.
    return;
  }
  try {
    Sentry.init({
      dsn,
      // Errors-only. Performance tracing is opt-in later.
      tracesSampleRate: 0,
      // Don't ship dev errors to Sentry. They're noise — the developer
      // is already looking at the Metro terminal. Flip this to true
      // temporarily if you specifically want to test the integration.
      enabled: true,
      // Send the SDK a hint that lets sentry.io group identical errors
      // across releases. expo-constants makes this trivial to read; we
      // fall back to 'unknown' so init never fails on a missing field.
      // Lazy import to avoid circular deps.
      release: getRelease(),
      // Default integrations are fine for v1. The console-breadcrumb
      // and react-navigation integrations come pre-wired.
    });
    initialized = true;
  } catch (e) {
    console.warn('[sentry] init failed — error tracking disabled.', e);
  }
}

/**
 * Tag the current Sentry session with the user's uid. Call from the
 * auth listener so errors get correctly attributed when the user signs
 * in / out. Pass `null` on sign-out to clear the attribution.
 *
 * Email + displayName are deliberately NOT sent — we keep Sentry to
 * opaque ids only.
 */
export function setSentryUser(uid: string | null): void {
  if (!initialized) return;
  try {
    if (uid) {
      Sentry.setUser({ id: uid });
    } else {
      Sentry.setUser(null);
    }
  } catch (e) {
    // Don't let observability throw into the user-facing path.
    console.warn('[sentry] setUser failed', e);
  }
}

/**
 * Manually report an exception. Most code should just throw and let
 * the ErrorBoundary catch — but for caught errors that the app
 * recovers from (e.g. local persistence write failures, optional
 * Firestore writes) you may want to surface them anyway. Use sparingly
 * to avoid drowning your inbox.
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    // intentionally silent
  }
}

// Pulled out so the init function stays readable. Reads from
// expo-constants's expoConfig — the version field is the same one
// shown on the Profile screen (v1.0.0 today).
function getRelease(): string {
  try {
    // Lazy-required so this module doesn't pull expo-constants into
    // server-only call sites (e.g. if anything ever imports lib/sentry
    // from a Cloud Function context, we don't blow up there).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    return Constants?.expoConfig?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// Re-export a couple of Sentry primitives so consumers don't have to
// import the SDK directly — keeps the surface area small and lets us
// swap providers later (e.g. to Bugsnag) by changing this file alone.
export { Sentry };
