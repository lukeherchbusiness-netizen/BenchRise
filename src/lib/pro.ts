import { getPro, usePro } from './purchases';

export { usePro };

// Old helpers kept so foods.tsx still compiles. loadPro now asks the real subscription.
export async function loadPro(): Promise<boolean> {
  return getPro();
}

// No longer does anything: Pro can only come from a real purchase now.
export async function savePro(_value: boolean): Promise<void> {}