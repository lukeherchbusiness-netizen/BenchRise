import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const UNIT_KEY = 'benchrise.unit.v1';

type Unit = 'lb' | 'kg';
type PlateLine = { plate: number; count: number; color: string };
type PlateResult =
  | { error: string }
  | { plates: PlateLine[]; leftover: number; loaded: number }
  | null;

const PLATES: Record<Unit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};
const BARS: Record<Unit, number[]> = { lb: [45, 35], kg: [20, 15] };
const PLATE_COLORS = ['#ff4d2e', '#ffb02e', '#3ddc97', '#4da3ff', '#b57bff', '#ff6ba8', '#8c8c98'];

const clean = (x: number) => Math.round(x * 100) / 100;

export default function Plates() {
  const router = useRouter();
  const [unit, setUnit] = useState<Unit>('lb');
  const [bar, setBar] = useState(45);
  const [target, setTarget] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const saved = await AsyncStorage.getItem(UNIT_KEY);
        if (saved === 'kg' || saved === 'lb') {
          setUnit(saved);
          setBar(BARS[saved][0]);
        }
      } catch (e) {
        // ignore
      }
    };
    load();
  }, []);

  const result = useMemo<PlateResult>(() => {
    const t = parseFloat(target);
    if (!(t > 0)) return null;
    if (t > 1500) return { error: 'That is more than a bar can hold. Try a lower number.' };
    if (t < bar) return { error: `The empty bar already weighs ${bar} ${unit}.` };

    let rem = Math.round(((t - bar) / 2) * 100);
    const out: PlateLine[] = [];
    PLATES[unit].forEach((p, i) => {
      const p100 = Math.round(p * 100);
      const count = Math.floor(rem / p100);
      if (count > 0) {
        out.push({ plate: p, count, color: PLATE_COLORS[i % PLATE_COLORS.length] });
        rem -= count * p100;
      }
    });
    const leftover = rem / 100;
    return { plates: out, leftover, loaded: clean(t - leftover * 2) };
  }, [target, bar, unit]);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>{'<  Back'}</Text>
        </Pressable>

        <Text style={styles.tag}>BENCHRISE</Text>
        <Text style={styles.title}>PLATES</Text>
        <Text style={styles.sub}>Enter the weight you want on the bar and see what to load on each side.</Text>

        <Text style={styles.label}>TARGET WEIGHT ({unit.toUpperCase()})</Text>
        <TextInput
          style={styles.input}
          value={target}
          onChangeText={setTarget}
          keyboardType="decimal-pad"
          placeholder={unit === 'lb' ? '225' : '100'}
          placeholderTextColor="#444450"
        />

        <Text style={styles.label}>BAR</Text>
        <View style={styles.chipRow}>
          {BARS[unit].map((b, i) => (
            <Pressable key={b} style={[styles.chip, bar === b ? styles.chipOn : null]} onPress={() => setBar(b)}>
              <Text style={[styles.chipText, bar === b ? styles.chipTextOn : null]}>
                {b} {unit}{i === 0 ? ' (standard)' : ' (women\'s)'}
              </Text>
            </Pressable>
          ))}
        </View>

        {result && 'error' in result && (
          <View style={styles.note}>
            <Text style={styles.noteText}>{result.error}</Text>
          </View>
        )}

        {result && 'plates' in result && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>LOAD EACH SIDE</Text>
            {result.plates.length === 0 ? (
              <Text style={styles.empty}>Just the bar. No plates needed.</Text>
            ) : (
              result.plates.map((p) => (
                <View key={p.plate} style={styles.plateRow}>
                  <View style={[styles.swatch, { backgroundColor: p.color }]} />
                  <Text style={styles.plateName}>{p.plate} {unit}</Text>
                  <Text style={styles.plateCount}>x {p.count}</Text>
                </View>
              ))
            )}
            <Text style={styles.total}>Total on the bar: {result.loaded} {unit}</Text>
            {result.leftover > 0 && (
              <Text style={styles.warn}>
                Your target can't be made exactly with standard plates. This is the closest weight below it.
              </Text>
            )}
          </View>
        )}

        <Text style={styles.fine}>
          Assumes standard plates. Some gyms don't have every size, so adjust to what is on the rack. Always use collars or clips, and load both sides evenly. Change units in Settings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  container: { padding: 22, paddingBottom: 70 },
  backText: { color: '#8c8c98', fontSize: 16, fontWeight: '700' },
  tag: { color: '#ff4d2e', fontSize: 13, fontWeight: '900', letterSpacing: 5, marginTop: 20 },
  title: { color: '#fff', fontSize: 46, fontWeight: '900', letterSpacing: -1, marginTop: 6 },
  sub: { color: '#9a9aa6', fontSize: 15, lineHeight: 22, marginTop: 8 },
  label: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 24, marginBottom: 8 },
  input: { backgroundColor: '#0d0d12', color: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#ff4d2e', paddingHorizontal: 16, paddingVertical: 14, fontSize: 36, fontWeight: '900' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#1e1e27', backgroundColor: '#0d0d12', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { borderColor: '#ff4d2e', backgroundColor: '#24120d' },
  chipText: { color: '#8c8c98', fontSize: 14, fontWeight: '800' },
  chipTextOn: { color: '#fff' },
  note: { backgroundColor: '#17140d', borderRadius: 14, borderWidth: 1, borderColor: '#352d1a', padding: 14, marginTop: 20 },
  noteText: { color: '#e5d6a8', fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: '#0d0d12', borderRadius: 20, borderWidth: 1.5, borderColor: '#ff4d2e', padding: 20, marginTop: 24 },
  cardLabel: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  empty: { color: '#b5b5c0', fontSize: 16, fontWeight: '700', marginTop: 8 },
  plateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a22' },
  swatch: { width: 14, height: 34, borderRadius: 4, marginRight: 14 },
  plateName: { flex: 1, color: '#fff', fontSize: 22, fontWeight: '900' },
  plateCount: { color: '#ff8a70', fontSize: 22, fontWeight: '900' },
  total: { color: '#cfcfd6', fontSize: 15, fontWeight: '700', marginTop: 14 },
  warn: { color: '#ffb02e', fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 10 },
  fine: { color: '#5f5f6a', fontSize: 12, lineHeight: 17, marginTop: 22 },
});