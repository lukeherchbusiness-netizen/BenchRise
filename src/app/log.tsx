import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const KEY = 'benchrise.log.v1';

type SetEntry = { id: string; ts: number; weight: number; reps: number };

// Epley formula: a common estimate of your one-rep max from a set
const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const shortLabel = (key: string) => {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
};

export default function WorkoutLog() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bench?: string }>();
  const start = parseFloat(params.bench ?? '');

  const [loaded, setLoaded] = useState(false);
  const [sets, setSets] = useState<SetEntry[]>([]);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw) as SetEntry[];
          if (Array.isArray(saved)) setSets(saved);
        }
      } catch (e) {
        // ignore: start with an empty log
      }
      setLoaded(true);
    };
    load();
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(KEY, JSON.stringify(sets)).catch(() => {});
    }
  }, [sets, loaded]);

  const stats = useMemo(() => {
    let best = 0;
    let heaviest = 0;
    const days = new Set<string>();
    sets.forEach((s) => {
      best = Math.max(best, e1rm(s.weight, s.reps));
      heaviest = Math.max(heaviest, s.weight);
      days.add(dayKey(s.ts));
    });
    return { best, heaviest, count: sets.length, days: days.size };
  }, [sets]);

  const grouped = useMemo(() => {
    const map: Record<string, SetEntry[]> = {};
    sets.forEach((s) => {
      const k = dayKey(s.ts);
      if (!map[k]) map[k] = [];
      map[k].push(s);
    });
    const keys = Object.keys(map).sort().reverse();
    return keys.map((k) => ({ key: k, items: map[k].sort((a, b) => b.ts - a.ts) }));
  }, [sets]);

  const chart = useMemo(() => {
    const best: Record<string, number> = {};
    sets.forEach((s) => {
      const k = dayKey(s.ts);
      best[k] = Math.max(best[k] ?? 0, e1rm(s.weight, s.reps));
    });
    const keys = Object.keys(best).sort().slice(-8);
    const vals = keys.map((k) => best[k]);
    const hi = Math.max(...vals, 1);
    const lo = Math.min(...vals, hi) * 0.9;
    return keys.map((k, i) => ({
      key: k,
      value: vals[i],
      height: 12 + ((vals[i] - lo) / (hi - lo || 1)) * 88,
    }));
  }, [sets]);

  const logSet = () => {
    const w = parseFloat(weight);
    const r = parseInt(reps, 10);
    if (!(w > 0)) {
      setError('Enter the weight you lifted.');
      return;
    }
    if (!(r >= 1 && r <= 30)) {
      setError('Enter reps between 1 and 30.');
      return;
    }
    const before = stats.best;
    const after = e1rm(w, r);
    setSets([...sets, { id: String(Date.now()), ts: Date.now(), weight: w, reps: r }]);
    setError('');
    setReps('');
    if (stats.count > 0 && after > before + 0.01) {
      setFlash(`New best! Estimated max ${Math.round(after)} lb.`);
    } else {
      setFlash('Set logged.');
    }
  };

  const removeSet = (id: string) => {
    Alert.alert('Delete this set?', 'This removes it from your log.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setSets(sets.filter((s) => s.id !== id)) },
    ]);
  };

  const gained = start > 0 && stats.best > 0 ? Math.round(stats.best - start) : null;

  if (!loaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>{'<  Back'}</Text>
        </Pressable>

        <Text style={styles.tag}>BENCHRISE</Text>
        <Text style={styles.title}>WORKOUT LOG</Text>
        <Text style={styles.sub}>Log your bench sets. We estimate your max and track your progress.</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>EST. MAX</Text>
            <Text style={styles.statValue}>{stats.best > 0 ? Math.round(stats.best) : '-'}</Text>
            <Text style={styles.statUnit}>lb</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>HEAVIEST SET</Text>
            <Text style={styles.statValue}>{stats.heaviest > 0 ? stats.heaviest : '-'}</Text>
            <Text style={styles.statUnit}>lb</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>SETS</Text>
            <Text style={styles.statValue}>{stats.count}</Text>
            <Text style={styles.statUnit}>{stats.days} days</Text>
          </View>
        </View>

        {gained !== null && (
          <View style={[styles.gainCard, gained > 0 ? styles.gainUp : null]}>
            <Text style={styles.gainLabel}>SINCE YOU STARTED ({start} LB)</Text>
            <Text style={styles.gainValue}>{gained > 0 ? `+${gained}` : String(gained)} lb</Text>
            {gained > 0 && (
              <Pressable onPress={() => router.push('/leaderboard')}>
                <Text style={styles.link}>Hit a new PR? Prove it on the leaderboard</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.formTitle}>Log a set</Text>
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>WEIGHT (LB)</Text>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="225"
                placeholderTextColor="#444450"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>REPS</Text>
              <TextInput
                style={styles.input}
                value={reps}
                onChangeText={setReps}
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor="#444450"
              />
            </View>
          </View>
          {error !== '' && <Text style={styles.error}>{error}</Text>}
          {error === '' && flash !== '' && <Text style={styles.flash}>{flash}</Text>}
          <Pressable style={styles.button} onPress={logSet}>
            <Text style={styles.buttonText}>LOG SET</Text>
          </Pressable>
        </View>

        {chart.length > 1 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionLabel}>ESTIMATED MAX BY DAY</Text>
            <View style={styles.chartRow}>
              {chart.map((c) => (
                <View key={c.key} style={styles.barCol}>
                  <Text style={styles.barValue}>{Math.round(c.value)}</Text>
                  <View style={[styles.bar, { height: c.height }]} />
                  <Text style={styles.barLabel}>{shortLabel(c.key)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>HISTORY</Text>
        {grouped.length === 0 && (
          <Text style={styles.empty}>No sets yet. Log your first set above.</Text>
        )}
        {grouped.map((g) => (
          <View key={g.key} style={styles.dayCard}>
            <Text style={styles.dayTitle}>{dayLabel(g.key)}</Text>
            {g.items.map((s) => (
              <View key={s.id} style={styles.setRow}>
                <Text style={styles.setMain}>
                  {s.weight} lb x {s.reps}
                </Text>
                <Text style={styles.setEst}>~{Math.round(e1rm(s.weight, s.reps))} max</Text>
                <Pressable onPress={() => removeSet(s.id)} hitSlop={10}>
                  <Text style={styles.del}>x</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.fine}>
          Estimated max uses a common formula and is most accurate for sets of 1 to 10 reps. It's a guide, not a promise. Only test a true max with a spotter or safeties. Your log is stored on this phone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const glow = { shadowColor: '#ff4d2e', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10 };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  container: { padding: 22, paddingBottom: 70 },
  backText: { color: '#8c8c98', fontSize: 16, fontWeight: '700' },
  tag: { color: '#ff4d2e', fontSize: 13, fontWeight: '900', letterSpacing: 5, marginTop: 20 },
  title: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -1, marginTop: 6 },
  sub: { color: '#9a9aa6', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 18 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: '#0d0d12', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e27', padding: 14 },
  statLabel: { color: '#7d7d89', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  statValue: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 6 },
  statUnit: { color: '#ff4d2e', fontSize: 12, fontWeight: '800', marginTop: -2 },
  gainCard: { backgroundColor: '#0d0d12', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e27', padding: 16, marginTop: 12 },
  gainUp: { borderColor: '#3ddc97', backgroundColor: '#0c1712' },
  gainLabel: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  gainValue: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 4 },
  link: { color: '#ff8a70', fontSize: 13, fontWeight: '800', marginTop: 8 },
  form: { backgroundColor: '#0d0d12', borderRadius: 20, borderWidth: 1.5, borderColor: '#ff4d2e', padding: 20, marginTop: 16 },
  formTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  twoCol: { flexDirection: 'row', gap: 10 },
  label: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: '#101016', color: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a34', paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '800' },
  error: { color: '#ff6b6b', fontSize: 14, fontWeight: '700', marginTop: 12 },
  flash: { color: '#3ddc97', fontSize: 14, fontWeight: '800', marginTop: 12 },
  button: { backgroundColor: '#ff4d2e', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16, ...glow },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  chartCard: { backgroundColor: '#0d0d12', borderRadius: 18, borderWidth: 1, borderColor: '#1e1e27', padding: 16, marginTop: 16 },
  sectionLabel: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14, height: 150 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 18, backgroundColor: '#ff4d2e', borderRadius: 5 },
  barValue: { color: '#cfcfd6', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  barLabel: { color: '#7d7d89', fontSize: 10, fontWeight: '700', marginTop: 6 },
  empty: { color: '#6a6a75', fontSize: 14, marginTop: 10 },
  dayCard: { backgroundColor: '#0d0d12', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e27', padding: 16, marginTop: 10 },
  dayTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1a1a22' },
  setMain: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  setEst: { color: '#ff8a70', fontSize: 13, fontWeight: '700', marginRight: 14 },
  del: { color: '#6a6a75', fontSize: 20, fontWeight: '900', paddingHorizontal: 4 },
  fine: { color: '#5f5f6a', fontSize: 12, lineHeight: 17, marginTop: 22 },
});