import AsyncStorage from '@react-native-async-storage/async-storage';

export const PRO_KEY = 'benchrise.pro.v1';

export async function loadPro(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PRO_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function savePro(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PRO_KEY, value ? '1' : '0');
  } catch {}
}