import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import { config } from '@/constants/config';

// Defense-in-depth Platform check. Callers (currently only useSubscription)
// already gate at the hook level, but exporting these wrappers as
// "always-callable" means a future caller that forgets the gate would
// crash on web with "Cannot read properties of undefined (reading
// 'configure')". Returning early everywhere here means RevenueCat
// methods become safe no-ops on web — same posture as the hook layer,
// just one level deeper.
const RC_AVAILABLE = Platform.OS === 'ios' || Platform.OS === 'android';

let initialized = false;

export async function initRevenueCat(uid: string): Promise<void> {
  if (!RC_AVAILABLE) return;
  if (initialized) {
    await Purchases.logIn(uid);
    return;
  }
  const apiKey = Platform.OS === 'ios' ? config.revenueCat.iosKey : config.revenueCat.androidKey;
  if (!apiKey) {
    console.warn('RevenueCat API key missing for platform', Platform.OS);
    return;
  }
  Purchases.configure({ apiKey, appUserID: uid });
  initialized = true;
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
