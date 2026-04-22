import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import { config } from '@/constants/config';

let initialized = false;

export async function initRevenueCat(uid: string): Promise<void> {
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
  try {
    const res = await Purchases.getOfferings();
    return res.current;
  } catch (e) {
    console.warn('getOfferings failed', e);
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesOffering['availablePackages'][number]): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

export function isEntitledPro(info: CustomerInfo): boolean {
  return info.entitlements.active['pro'] !== undefined;
}
