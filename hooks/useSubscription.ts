import { useCallback, useEffect } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useAuthStore } from '@/stores/authStore';
import {
  initRevenueCat,
  getCustomerInfo,
  isEntitledPro,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from '@/lib/revenuecat';

function applyInfo(info: CustomerInfo, apply: (s: { plan: any; isActive: boolean; expiresAt: number | null }) => void) {
  const pro = info.entitlements.active['pro'];
  const expiresAt = pro?.expirationDate ? new Date(pro.expirationDate).getTime() : null;
  const plan = pro?.productIdentifier?.includes('weekly')
    ? 'weekly'
    : pro?.productIdentifier?.includes('yearly')
    ? 'yearly'
    : pro?.productIdentifier?.includes('monthly')
    ? 'monthly'
    : null;
  apply({ plan, isActive: isEntitledPro(info), expiresAt });
}

export function useSubscription() {
  const { user } = useAuthStore();
  const { setSubscription, setLoading, ...state } = useSubscriptionStore();

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        await initRevenueCat(user.uid);
        const info = await getCustomerInfo();
        applyInfo(info, setSubscription);
      } catch (e) {
        console.warn('subscription init failed', e);
      } finally {
        setLoading(false);
      }
    })();

    const listener = (info: CustomerInfo) => applyInfo(info, setSubscription);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [user, setSubscription, setLoading]);

  const offerings = useCallback(() => getOfferings(), []);
  const purchase = useCallback(
    async (pkg: Parameters<typeof purchasePackage>[0]) => {
      const info = await purchasePackage(pkg);
      applyInfo(info, setSubscription);
      return info;
    },
    [setSubscription],
  );
  const restore = useCallback(async () => {
    const info = await restorePurchases();
    applyInfo(info, setSubscription);
    return info;
  }, [setSubscription]);

  return { ...state, offerings, purchase, restore };
}
