import { create } from 'zustand';

export type Plan = 'weekly' | 'monthly' | 'yearly' | null;

interface SubscriptionState {
  plan: Plan;
  isActive: boolean;
  expiresAt: number | null;
  loading: boolean;
  setSubscription: (s: { plan: Plan; isActive: boolean; expiresAt: number | null }) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  plan: null,
  isActive: false,
  expiresAt: null,
  loading: false,
  setSubscription: ({ plan, isActive, expiresAt }) => set({ plan, isActive, expiresAt }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ plan: null, isActive: false, expiresAt: null, loading: false }),
}));
