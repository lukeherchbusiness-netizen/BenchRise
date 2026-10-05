import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

// Public RevenueCat key for the App Store app (safe to ship in the app).
const IOS_KEY = 'appl_IDEcBptBJWuptwINCoYUlqwHoZX';

// Expo Go has no real App Store connection, so purchases are skipped there.
const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';

let started: Promise<boolean> | null = null;
let pro = false;
const listeners = new Set<(v: boolean) => void>();

function hasPro(info: CustomerInfo) {
  return Object.keys(info.entitlements.active).length > 0;
}

function apply(info: CustomerInfo) {
  const next = hasPro(info);
  if (next !== pro) {
    pro = next;
    listeners.forEach((l) => l(pro));
  }
}

// Returns true only if RevenueCat started successfully.
export function initPurchases(): Promise<boolean> {
  if (!started) {
    started = (async () => {
      try {
        if (Platform.OS !== 'ios' || IN_EXPO_GO) return false;
        Purchases.configure({ apiKey: IOS_KEY });
        Purchases.addCustomerInfoUpdateListener(apply);
        try {
          apply(await Purchases.getCustomerInfo());
        } catch (e) {
          // offline: the listener will update us later
        }
        return true;
      } catch (e) {
        return false;
      }
    })();
  }
  return started;
}

export async function getPro(): Promise<boolean> {
  await initPurchases();
  return pro;
}

export function usePro(): boolean {
  const [value, setValue] = useState(pro);
  useEffect(() => {
    listeners.add(setValue);
    initPurchases().then(() => setValue(pro));
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

export type Packages = { monthly?: PurchasesPackage; annual?: PurchasesPackage };

export async function getPackages(): Promise<Packages> {
  if (!(await initPurchases())) return {};
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    return { monthly: current?.monthly ?? undefined, annual: current?.annual ?? undefined };
  } catch (e) {
    return {};
  }
}

export async function buy(pkg: PurchasesPackage): Promise<'ok' | 'cancelled' | 'error'> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    apply(customerInfo);
    return 'ok';
  } catch (e: any) {
    return e?.userCancelled ? 'cancelled' : 'error';
  }
}

export async function restore(): Promise<'active' | 'none' | 'error'> {
  try {
    if (!(await initPurchases())) return 'error';
    const info = await Purchases.restorePurchases();
    apply(info);
    return hasPro(info) ? 'active' : 'none';
  } catch (e) {
    return 'error';
  }
}