import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { UserDoc } from '@/lib/firestore';

interface AuthState {
  user: User | null;
  userDoc: UserDoc | null;
  loading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  setUserDoc: (doc: UserDoc | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  userDoc: null,
  loading: true,
  error: null,
  setUser: (user) => set({ user }),
  setUserDoc: (userDoc) => set({ userDoc }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set({ user: null, userDoc: null, loading: false, error: null }),
}));
