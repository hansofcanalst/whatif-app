import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { subscribeToAuth } from '@/lib/auth';
import { ensureUserDoc } from '@/lib/firestore';

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
          .then((doc) => setUserDoc(doc))
          .catch((e) => console.warn('[auth] ensureUserDoc failed', e));
      } else {
        setUserDoc(null);
      }
    });

    return () => {
      clearTimeout(fallback);
      unsub();
    };
  }, [setUser, setUserDoc, setLoading, setError]);

  return { user, userDoc, loading, error };
}
