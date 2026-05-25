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
  isRevenueCatConfigured,
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

    // Order matters here: do NOT register a CustomerInfo listener until
    // `initRevenueCat` resolves AND reports success. The previous shape
    // registered the listener synchronously after kicking off the async
    // init IIFE — but `await initRevenueCat` yields, so the listener
    // would be registered BEFORE `Purchases.configure` ran. On iOS in
    // Release, that raises an NSException ("Purchases has not been
    // configured") which RN 0.81's `convertNSExceptionToJSError`
    // SIGSEGVs on, crashing the app at launch. Tracked + fixed in the
    // 2026-05-25 PROGRESS_LOG entry.
    let cancelled = false;
    let listener: ((info: CustomerInfo) => void) | null = null;

    (async () => {
      setLoading(true);
      try {
        const configured = await initRevenueCat(user.uid);
        if (cancelled) return;
        if (!configured || !isRevenueCatConfigured()) {
          // No API key, or configure threw. Skip the listener +
          // getCustomerInfo dance — both would raise NSExceptions on
          // an un-configured SDK.
          return;
        }
        try {
          const info = await getCustomerInfo();
          if (cancelled) return;
          applyInfo(info, setSubscription);
        } catch (e) {
          console.warn('[subscription] getCustomerInfo failed', e);
        }
        if (cancelled) return;
        const l = (info: CustomerInfo) => applyInfo(info, setSubscription);
        try {
          Purchases.addCustomerInfoUpdateListener(l);
          listener = l;
        } catch (e) {
          console.warn('[subscription] addCustomerInfoUpdateListener failed', e);
        }
      } catch (e) {
        console.warn('[subscription] init failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (listener && isRevenueCatConfigured()) {
        try {
          Purchases.removeCustomerInfoUpdateListener(listener);
        } catch (e) {
          console.warn('[subscription] removeCustomerInfoUpdateListener failed', e);
        }
      }
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
