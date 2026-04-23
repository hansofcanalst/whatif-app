import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { subscribeToAuth } from '@/lib/auth';
import { ensureUserDoc, UserDoc } from '@/lib/firestore';

const AUTH_FALLBACK_MS = 5000;

export function useAuth() {
  const { user, userDoc, loading, error, setUser, setUserDoc, setLoading, setError } = useAuthStore();
  const settledRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    settledRef.current = false;

    // Safety timeout: if the auth listener never fires (native bridge stall,
    // silent init failure), flip loading=false so navigation can proceed to
    // the login screen instead of hanging on a blank screen forever.
    const fallback = setTimeout(() => {
      if (!settledRef.current) {
        console.warn('[auth] onAuthStateChanged did not fire within 5s — treating as signed out.');
        settledRef.current = true;
        setUser(null);
        setUserDoc(null);
        setError('Auth timed out. Please log in.');
        setLoading(false);
      }
    }, AUTH_FALLBACK_MS);

    const unsub = subscribeToAuth((u) => {
      if (!settledRef.current) {
        settledRef.current = true;
        clearTimeout(fallback);
      }
      setUser(u);

      // IMPORTANT: flip loading=false immediately off the auth callback.
      // Loading userDoc from Firestore can hang independently; don't block
      // the router on it. The home screen can show a skeleton if needed.
      setLoading(false);

      if (u) {
        ensureUserDoc(u)
          .then((doc) => {
            setUserDoc(doc);
            syncSubscriptionFromUserDoc(doc);
          })
          .catch((e) => console.warn('[auth] ensureUserDoc failed', e));
      } else {
        setUserDoc(null);
        useSubscriptionStore.getState().reset();
      }
    });

    return () => {
      clearTimeout(fallback);
      unsub();
    };
  }, [setUser, setUserDoc, setLoading, setError]);

  return { user, userDoc, loading, error };
}

// Firestore is the authoritative source of Pro status on the server
// (`functions/src/generate.ts` reads `user.subscriptionStatus`) and also
// what RevenueCat webhooks update. Mirroring it into the subscription
// store on every user-doc load means:
//   1. Flipping `subscriptionStatus` in the Firebase console is enough to
//      unlock Pro in the UI — no need to also poke the Zustand store.
//   2. On web — where RevenueCat's native SDK isn't wired — Pro users
//      still see the correct badge.
//   3. On native, `useSubscription` will overwrite this with fresh
//      RevenueCat entitlement info as soon as it loads, so this acts as
//      a safe initial value rather than a competing source of truth.
function syncSubscriptionFromUserDoc(doc: UserDoc): void {
  const isActive = doc.subscriptionStatus === 'pro';
  const expiresAt = doc.subscriptionExpiry
    ? doc.subscriptionExpiry.toMillis()
    : null;
  useSubscriptionStore.getState().setSubscription({
    plan: isActive ? 'yearly' : null,
    isActive,
    expiresAt,
  });
}
