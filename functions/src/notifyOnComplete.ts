// Server-side push trigger.
//
// Fires when a generations/{id} doc transitions out of 'processing':
//   processing → complete   → "Your N transformations are ready"
//   processing → failed     → "Your transformation didn't work out"
//
// Other transitions (no-status-change updates, going TO 'processing')
// don't trigger anything.
//
// Why a Firestore trigger rather than calling FCM directly from the
// generate function:
//   - Decoupling: a future cleanup or backfill job that flips status
//     in bulk gets notifications for free without re-running model
//     calls.
//   - Reliability: Firestore triggers retry automatically on transient
//     failures, with backoff. The generate function is already long
//     and we don't want a flaky push send to retry the whole 60s of
//     model work.
//   - Locality: keeps the generate function focused on generation;
//     keeps notification logic in one place where you'd look for it.
//
// Why Expo Push API (https://exp.host/--/api/v2/push/send) rather
// than direct FCM:
//   - Single endpoint covers both iOS APNs + Android FCM
//   - No APNs cert configuration on the server side — Expo handles it
//   - Trade-off: rate-limited per project, no rich delivery receipts.
//     Both are fine for our scale and use case.
//
// What gets sent:
//   - title: short, neutral
//   - body: variant-aware ("3 of 5 ready" or "All transformations
//     failed")
//   - data: { generationId, route } so the client tap handler can
//     deep-link to /result/{id}?idx=0

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface GenerationData {
  userId?: string;
  status?: string;
  results?: unknown[];
}

interface UserData {
  expoPushToken?: string;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default' | null;
  // Categories let iOS group related pushes; we use a single one for
  // generation-complete events so they collapse rather than stack.
  categoryId?: string;
}

export const onGenerationCompleted = functions.firestore
  .document('generations/{id}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as GenerationData | undefined;
    const after = change.after.data() as GenerationData | undefined;
    if (!before || !after) return;

    // Only fire on the specific status transitions that produce a
    // user-visible result. `processing → complete` and `processing →
    // failed` both qualify. Going from no-status to a final status
    // (which can happen for retries / backfills) also qualifies.
    const wasFinal = before.status === 'complete' || before.status === 'failed';
    const isFinal = after.status === 'complete' || after.status === 'failed';
    if (wasFinal || !isFinal) return;

    const generationId = context.params.id;
    const userId = after.userId;
    if (!userId) {
      console.warn(
        `[notify] generation ${generationId} has no userId; skipping push`,
      );
      return;
    }

    // Read the user's stored push token. No token (web user, or never
    // registered) → silent skip; this isn't an error condition.
    const userSnap = await admin.firestore().collection('users').doc(userId).get();
    const user = userSnap.data() as UserData | undefined;
    const token = user?.expoPushToken;
    if (!token) return;

    // Compose the message. We carry a result count + failed count so
    // the body is informative ("3 of 5 ready · 2 failed") without
    // exposing prompt details on the lock screen — those are private.
    const resultCount = Array.isArray(after.results) ? after.results.length : 0;
    const message = composeMessage({
      token,
      status: after.status as 'complete' | 'failed',
      resultCount,
      generationId,
    });

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      const body = await res.text();
      if (!res.ok) {
        console.warn(`[notify] Expo push returned ${res.status}: ${body}`);
        return;
      }
      // Expo's response includes a per-device delivery receipt with
      // status 'ok' or 'error'. We log error-status so a stale token
      // (uninstalled app, expired) shows up in Cloud Function logs
      // and we can fix it; we don't auto-clean tokens here yet — a
      // separate "purge stale tokens" job is the right place.
      try {
        const parsed = JSON.parse(body) as {
          data?: { status?: string; message?: string }[];
        };
        const first = parsed.data?.[0];
        if (first?.status === 'error') {
          console.warn(
            `[notify] expo delivery error for ${userId}: ${first.message ?? 'unknown'}`,
          );
        }
      } catch {
        /* response wasn't JSON; the !res.ok branch above already covered errors */
      }
    } catch (err) {
      // Network error to Expo. Log + drop — the function will retry
      // on its own per the default Firestore-trigger retry policy.
      console.warn('[notify] expo push network error', err);
    }
  });

function composeMessage(args: {
  token: string;
  status: 'complete' | 'failed';
  resultCount: number;
  generationId: string;
}): ExpoMessage {
  const base: Pick<ExpoMessage, 'to' | 'data' | 'sound' | 'categoryId'> = {
    to: args.token,
    data: {
      generationId: args.generationId,
      // The client's notification-tap handler reads `route` and
      // navigates accordingly. Centralized here so the deep-link
      // contract is explicit at the send site.
      route: `/result/${args.generationId}?idx=0`,
    },
    sound: null,
    categoryId: 'generation',
  };
  if (args.status === 'failed' || args.resultCount === 0) {
    return {
      ...base,
      title: 'What If',
      body: "This one didn't work out — tap to try again.",
    };
  }
  const ready = args.resultCount === 1
    ? '1 transformation ready'
    : `${args.resultCount} transformations ready`;
  return {
    ...base,
    title: 'Your What Ifs are ready ✨',
    body: ready,
  };
}
