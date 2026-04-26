import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
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

// react-native-purchases has no real implementation on the web target —
// the module resolves but its methods are undefined, so calls like
// Purchases.isConfigured() throw "Cannot read properties of undefined".
// Web has no IAP path anyway (no App Store / Play Store on the web),
// so we no-op the entire RevenueCat surface there. Pro status on web
// is sourced from the user doc's `subscriptionStatus` field instead,
// which `useAuth` already mirrors into the subscription store via
// syncSubscriptionFromUserDoc — so Pro users still see correct
// entitlements on web, just without the live purchase flow.
const RC_AVAILABLE = Platform.OS === 'ios' || Platform.OS === 'android';

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
    // Skip the entire RC init+listener dance on web. The previous
    // version threw `TypeError: Cannot read properties of undefined
    // (reading 'isConfigured')` on every page load and that was both
    // user-invisible noise and a guaranteed Sentry pollutant once
    // shipped to production web.
    if (!RC_AVAILABLE) return;

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

  const offerings = useCallback(async () => {
    if (!RC_AVAILABLE) return null;
    return getOfferings();
  }, []);
  const purchase = useCallback(
    async (pkg: Parameters<typeof purchasePackage>[0]) => {
      if (!RC_AVAILABLE) {
        throw new Error('In-app purchases are not available on web. Open the app on iOS or Android to subscribe.');
      }
      const info = await purchasePackage(pkg);
      applyInfo(info, setSubscription);
      return info;
    },
    [setSubscription],
  );
  const restore = useCallback(async () => {
    if (!RC_AVAILABLE) {
      throw new Error('Restore is not available on web. Open the app on iOS or Android to restore purchases.');
    }
    const info = await restorePurchases();
    applyInfo(info, setSubscription);
    return info;
  }, [setSubscription]);

  return { ...state, offerings, purchase, restore };
}
