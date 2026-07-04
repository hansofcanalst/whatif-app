import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import { config, V1_MONETIZATION_ENABLED } from '@/constants/config';

// Defense-in-depth Platform check. Callers (currently only useSubscription)
// already gate at the hook level, but exporting these wrappers as
// "always-callable" means a future caller that forgets the gate would
// crash on web with "Cannot read properties of undefined (reading
// 'configure')". Returning early everywhere here means RevenueCat
// methods become safe no-ops on web — same posture as the hook layer,
// just one level deeper.
const RC_AVAILABLE = Platform.OS === 'ios' || Platform.OS === 'android';

let initialized = false;

export function isRevenueCatConfigured(): boolean {
  return initialized;
}

// Returns true iff the SDK is configured and safe to call other methods on.
// Callers MUST check this before invoking listener registration or any other
// Purchases.* method — calling them pre-configure on iOS in Release raises an
// NSException that RN 0.81's TurboModule layer converts to a JS error via
// `convertNSExceptionToJSError`, which is known to SIGSEGV on nil reasons
// (see release-build crash investigation 2026-05-25).
export async function initRevenueCat(uid: string): Promise<boolean> {
  if (!RC_AVAILABLE) return false;
  // v1 monetization is OFF — do not configure the SDK. The dependency
  // stays bundled but dormant; flip V1_MONETIZATION_ENABLED in
  // constants/config.ts to re-enable. The API-key check below remains.
  if (!V1_MONETIZATION_ENABLED) return false;
  if (initialized) {
    try {
      await Purchases.logIn(uid);
    } catch (e) {
      console.warn('[revenuecat] logIn failed', e);
    }
    return true;
  }
  const apiKey = Platform.OS === 'ios' ? config.revenueCat.iosKey : config.revenueCat.androidKey;
  if (!apiKey) {
    console.warn('[revenuecat] API key missing for platform', Platform.OS, '— SDK will stay un-configured.');
    return false;
  }
  try {
    Purchases.configure({ apiKey, appUserID: uid });
    initialized = true;
    return true;
  } catch (e) {
    console.warn('[revenuecat] configure threw — SDK will stay un-configured.', e);
    initialized = false;
    return false;
  }
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!RC_AVAILABLE) return null;
  try {
    const res = await Purchases.getOfferings();
    return res.current;
  } catch (e) {
    console.warn('getOfferings failed', e);
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesOffering['availablePackages'][number]): Promise<CustomerInfo> {
  if (!RC_AVAILABLE) {
    throw new Error('In-app purchases are not available on web.');
  }
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  if (!RC_AVAILABLE) {
    throw new Error('Restore is not available on web.');
  }
  return Purchases.restorePurchases();
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  if (!RC_AVAILABLE) {
    throw new Error('Subscription info is not available on web.');
  }
  return Purchases.getCustomerInfo();
}

export function isEntitledPro(info: CustomerInfo): boolean {
  return info.entitlements.active['pro'] !== undefined;
}
