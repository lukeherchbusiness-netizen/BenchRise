import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRESETS = [
  { label: '1:00', sub: 'Speed sets', seconds: 60 },
  { label: '1:30', sub: 'Accessories', seconds: 90 },
  { label: '2:00', sub: 'Volume sets', seconds: 120 },
  { label: '3:00', sub: 'Heavy sets', seconds: 180 },
  { label: '4:00', sub: 'Max attempts', seconds: 240 },
];

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
};

export default function RestTimer() {
  const router = useRouter();
  const [endAt, setEndAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [left, setLeft] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (endAt === null) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        setEndAt(null);
        setDone(true);
        Vibration.vibrate();
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  const start = (seconds: number) => {
    setTotal(seconds);
    setLeft(seconds);
    setDone(false);
    setEndAt(Date.now() + seconds * 1000);
  };

  const stop = () => {
    setEndAt(null);
    setLeft(0);
    setDone(false);
  };

  const running = endAt !== null;
  const progress = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>{'<  Back'}</Text>
        </Pressable>

        <Text style={styles.tag}>BENCHRISE</Text>
        <Text style={styles.title}>REST TIMER</Text>
        <Text style={styles.sub}>Rest the right amount between sets. Heavy sets need the longest breaks.</Text>

        <View style={[styles.clock, done ? styles.clockDone : null]}>
          <Text style={styles.clockLabel}>{done ? 'TIME TO LIFT' : running ? 'RESTING' : 'PICK A REST TIME'}</Text>
          <Text style={[styles.time, done ? styles.timeDone : null]}>{running ? fmt(left) : done ? '0:00' : '-:--'}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          {(running || done) && (
            <Pressable style={styles.stopBtn} onPress={stop}>
              <Text style={styles.stopText}>{done ? 'RESET' : 'STOP'}</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.label}>START A TIMER</Text>
        {PRESETS.map((p) => (
          <Pressable key={p.seconds} style={styles.preset} onPress={() => start(p.seconds)}>
            <Text style={styles.presetTime}>{p.label}</Text>
            <Text style={styles.presetSub}>{p.sub}</Text>
          </Pressable>
        ))}

        <Text style={styles.fine}>
          The timer buzzes when time is up, but only while the app is open on screen. If you lock your phone or switch apps, it will not alert you.
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
  clock: { backgroundColor: '#0d0d12', borderRadius: 22, borderWidth: 1.5, borderColor: '#2a1812', padding: 22, marginTop: 22, alignItems: 'center' },
  clockDone: { borderColor: '#3ddc97', backgroundColor: '#0c1712' },
  clockLabel: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  time: { color: '#fff', fontSize: 84, fontWeight: '900', letterSpacing: -2, marginTop: 6 },
  timeDone: { color: '#3ddc97' },
  track: { alignSelf: 'stretch', height: 8, backgroundColor: '#1e1e27', borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  fill: { height: 8, backgroundColor: '#ff4d2e', borderRadius: 4 },
  stopBtn: { borderWidth: 1.5, borderColor: '#2c2c36', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 18 },
  stopText: { color: '#cfcfd6', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  label: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 26, marginBottom: 10 },
  preset: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d12', borderRadius: 14, borderWidth: 1.5, borderColor: '#1e1e27', padding: 16, marginBottom: 8 },
  presetTime: { color: '#fff', fontSize: 24, fontWeight: '900', width: 90 },
  presetSub: { color: '#8c8c98', fontSize: 15, fontWeight: '700' },
  fine: { color: '#5f5f6a', fontSize: 12, lineHeight: 17, marginTop: 22 },
});