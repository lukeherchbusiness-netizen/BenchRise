import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadUnit, Unit, UNIT_KEY } from '../lib/units';

const DATA_KEYS = ['benchrise.answers.v1', 'benchrise.log.v1', UNIT_KEY];

export default function Settings() {
  const router = useRouter();
  const [unit, setUnit] = useState<Unit>('lb');
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    loadUnit().then(setUnit);
  }, []);

  const pickUnit = (u: Unit) => {
    setUnit(u);
    AsyncStorage.setItem(UNIT_KEY, u).catch(() => {});
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete all your data?',
      'This erases your plan answers, your workout log, and your settings from this phone. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(DATA_KEYS);
            } catch (e) {
              // ignore
            }
            setUnit('lb');
            setDeleted(true);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>{'<  Back'}</Text>
        </Pressable>

        <Text style={styles.tag}>BENCHRISE</Text>
        <Text style={styles.title}>SETTINGS</Text>

        <Text style={styles.label}>UNITS</Text>
        <View style={styles.chipRow}>
          {(['lb', 'kg'] as Unit[]).map((u) => (
            <Pressable key={u} style={[styles.chip, unit === u ? styles.chipOn : null]} onPress={() => pickUnit(u)}>
              <Text style={[styles.chipText, unit === u ? styles.chipTextOn : null]}>{u === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>
          Applies to your plan, workout log, macros, leaderboard, and plates. Switching never changes your saved lifts, only how they're shown.
        </Text>

        <Text style={styles.label}>YOUR DATA</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>
            Your plan answers and workout log are stored only on this phone. Deleting them cannot be undone.
          </Text>
          <Pressable style={styles.danger} onPress={confirmDelete}>
            <Text style={styles.dangerText}>DELETE MY DATA</Text>
          </Pressable>
          {deleted && (
            <Text style={styles.done}>
              Done. Fully close the app (swipe it away) and reopen it to start fresh.
            </Text>
          )}
        </View>

        <Text style={styles.label}>LEGAL</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowText}>Terms of Service</Text>
            <Text style={styles.soon}>Added before launch</Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowText}>Privacy Policy</Text>
            <Text style={styles.soon}>Added before launch</Text>
          </View>
        </View>

        <Text style={styles.label}>ABOUT</Text>
        <View style={styles.card}>
          <Text style={styles.cardText}>BenchRise, demo build. Payments and the shared leaderboard are not live yet.</Text>
        </View>
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
  label: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 28, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: { borderWidth: 1.5, borderColor: '#1e1e27', backgroundColor: '#0d0d12', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  chipOn: { borderColor: '#ff4d2e', backgroundColor: '#24120d' },
  chipText: { color: '#8c8c98', fontSize: 15, fontWeight: '800' },
  chipTextOn: { color: '#fff' },
  hint: { color: '#6a6a75', fontSize: 13, lineHeight: 19, marginTop: 10 },
  card: { backgroundColor: '#0d0d12', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e27', padding: 16 },
  cardText: { color: '#b5b5c0', fontSize: 14, lineHeight: 21 },
  danger: { borderWidth: 1.5, borderColor: '#ff6b6b', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  dangerText: { color: '#ff6b6b', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  done: { color: '#3ddc97', fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a22' },
  rowLast: { borderBottomWidth: 0 },
  rowText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  soon: { color: '#6a6a75', fontSize: 12, fontWeight: '700' },
});