// Push-notification setup for the "your generation is ready" pings.
//
// Architecture:
//
//   1. On app launch (post-auth), we request permission, fetch the
//      Expo push token, and write it to `users/{uid}.expoPushToken`
//      in Firestore.
//
//   2. The server's `onGenerationCompleted` Firestore trigger reads
//      that token when a generation transitions to complete/failed
//      and posts a notification through Expo's Push API.
//
//   3. When the user taps the notification, the app deep-links to
//      `/result/{id}?idx=0` so they land on the first result tile.
//      If the app was killed, expo-router handles the cold-start
//      navigation; if it was backgrounded, we navigate via the
//      response listener below.
//
// Why Expo Push API rather than direct FCM/APNs:
//   - Single endpoint, single auth model, no APNs cert wrangling
//   - Works with Expo Go (Android only) for quick testing
//   - Expo handles the FCM/APNs translation under the hood
//   - We only lose if we want delivery receipts at scale (which we
//     don't — see the server side for the trade-off)
//
// Web + Expo-Go-on-iOS limitations:
//   - Web has no native push system in this stack; we no-op there.
//   - Expo Go on iOS can no longer receive push notifications from
//     the Expo Push API (Apple changed the rules in 2024). On iOS
//     you'd need an EAS dev build to test. We log + skip there
//     rather than throw.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { captureError } from './sentry';

// Set the foreground notification handler ONCE at module-load. When
// the app is foregrounded and a notification arrives, we still show
// a banner — the user might be on a different screen than the one
// the notification refers to (e.g. browsing gallery while a previous
// generation completes). Sound + badge stay off because the
// generation flow isn't urgent enough to interrupt with audio.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    // expo-notifications v0.32+ split out banner/list visibility on iOS.
    // We want both for foreground notifications.
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Track listener subscriptions so we can unregister them cleanly. The
// app's navigation listener is a long-lived effect; without explicit
// cleanup a hot-reloaded dev session can leak duplicate handlers.
let receivedSub: Notifications.Subscription | null = null;
let responseSub: Notifications.Subscription | null = null;

/**
 * Request permission and persist the Expo push token to Firestore for
 * the given user. Safe to call multiple times — token writes are
 * idempotent.
 *
 * Returns the token (so callers can log it for debugging) or null if
 * registration was skipped or failed. Never throws — push is a
 * best-effort enhancement, not a critical path.
 */
export async function registerPushToken(uid: string): Promise<string | null> {
  // Web has no push in this stack.
  if (Platform.OS === 'web') return null;

  // Push tokens are only meaningful on real devices. Simulators on iOS
  // get a fake token that Expo's push service rejects; Android emulators
  // can technically work but it's not worth the special-casing.
  if (!Device.isDevice) {
    console.log('[push] skipping registration on simulator/emulator');
    return null;
  }

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const { status: requested } = await Notifications.requestPermissionsAsync();
      status = requested;
    }
    if (status !== 'granted') {
      console.log('[push] permission denied — skipping token registration');
      return null;
    }

    // Expo wants a `projectId` on SDK 49+. Pull from expoConfig.extra.eas
    // (the standard EAS-injected location); fall back to top-level if
    // someone configured it manually.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) {
      console.warn(
        '[push] no EAS projectId — token fetch will fail. Run `eas init` to wire one up.',
      );
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return null;

    // Persist to Firestore so the Cloud Function can read it. We also
    // record platform + a timestamp; multiple devices for one user
    // overwrite each other for now (single-token model). Multi-device
    // is a future expansion (token list with expiry).
    await setDoc(
      doc(db, 'users', uid),
      {
        expoPushToken: token,
        expoPushTokenPlatform: Platform.OS,
        expoPushTokenUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    console.log(`[push] token registered (${Platform.OS})`);
    return token;
  } catch (e) {
    console.warn('[push] registerPushToken failed', e);
    captureError(e, { where: 'registerPushToken' });
    return null;
  }
}

/**
 * Wire the foreground + tap-response listeners.
 *
 * @param onTap  Called with the notification data payload when the user
 *               taps a push (whether the app was foregrounded,
 *               backgrounded, or killed). Use this to deep-link.
 * @returns      An unregister function — call from a useEffect cleanup.
 */
export function setupNotificationListeners(
  onTap: (data: Record<string, unknown>) => void,
): () => void {
  if (Platform.OS === 'web') return () => undefined;

  // Tear down any prior subscriptions before registering new ones —
  // necessary across hot-reloads to avoid duplicate firings.
  receivedSub?.remove();
  responseSub?.remove();

  // Foreground arrival — currently a no-op handler (the visible
  // banner is enough), but kept hooked up so we can add e.g.
  // Sentry breadcrumbs or analytics later.
  receivedSub = Notifications.addNotificationReceivedListener((_n) => {
    // Intentionally empty.
  });

  // Tap response — the meaty handler. Fires on tap regardless of
  // app state (cold start, background, foreground).
  responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = (response.notification.request.content.data ?? {}) as Record<
        string,
        unknown
      >;
      onTap(data);
    } catch (e) {
      console.warn('[push] tap handler threw', e);
      captureError(e, { where: 'notification-tap' });
    }
  });

  return () => {
    receivedSub?.remove();
    responseSub?.remove();
    receivedSub = null;
    responseSub = null;
  };
}
