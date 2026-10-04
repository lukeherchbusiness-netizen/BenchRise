import AsyncStorage from '@react-native-async-storage/async-storage';

export type Unit = 'lb' | 'kg';

export const UNIT_KEY = 'benchrise.unit.v1';
export const LB_PER_KG = 2.20462262;

export async function loadUnit(): Promise<Unit> {
  try {
    const v = await AsyncStorage.getItem(UNIT_KEY);
    if (v === 'kg' || v === 'lb') return v;
  } catch (e) {
    // ignore: fall back to pounds
  }
  return 'lb';
}

export const toDisplay = (lb: number, unit: Unit) => (unit === 'kg' ? lb / LB_PER_KG : lb);
export const toLb = (value: number, unit: Unit) => (unit === 'kg' ? value * LB_PER_KG : value);

// Show a weight with at most one decimal and no trailing zero
export const fmt = (lb: number, unit: Unit) => String(Math.round(toDisplay(lb, unit) * 10) / 10);