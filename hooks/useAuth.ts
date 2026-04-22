import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { subscribeToAuth } from '@/lib/auth';
import { ensureUserDoc } from '@/lib/firestore';

export function useAuth() {
  const { user, userDoc, loading, error, setUser, setUserDoc, setLoading } = useAuthStore();

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAuth(async (u) => {
      setUser(u);
      if (u) {
        try {
          const doc = await ensureUserDoc(u);
          setUserDoc(doc);
        } catch (e) {
          console.warn('ensureUserDoc failed', e);
        }
      } else {
        setUserDoc(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [setUser, setUserDoc, setLoading]);

  return { user, userDoc, loading, error };
}
