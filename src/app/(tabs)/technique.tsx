import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Paywall from '../../components/Paywall';
import { usePro } from '../../lib/purchases';

const ANSWERS_KEY = 'benchrise.answers.v1';

const LESSON_PERKS = [
  'All technique lessons',
  'Every week of your full program',
  'Food tracker with barcode scan',
  'Leaderboard and PR video uploads',
];

type Lesson = {
  id: string;
  title: string;
  minutes: number;
  free: boolean;
  summary: string;
  steps: string[];
  mistakes: string[];
};

const LESSONS: Lesson[] = [
  {
    id: 'setup',
    title: 'Set up on the bench',
    minutes: 3,
    free: true,
    summary: 'A tight, stable setup is the base of every strong bench. Most missed lifts start before the bar leaves the rack.',
    steps: [
      'Lie down with your eyes under the bar.',
      'Pull your shoulder blades back and down, like you are tucking them into your back pockets.',
      'Keep a small arch in your upper back, with your butt staying on the bench.',
      'Plant your feet flat on the floor, under your knees or slightly behind them.',
      'Take a grip a little wider than shoulder width, so your forearms are close to vertical when the bar is on your chest.',
      'Wrap your thumbs around the bar.',
    ],
    mistakes: [
      'Letting your shoulders roll forward as you unrack.',
      'Lifting your butt off the bench to press.',
      'Feet that drift or bounce during the set.',
    ],
  },
  {
    id: 'safety',
    title: 'Lift safely',
    minutes: 2,
    free: true,
    summary: 'Heavy benching is safe when you plan for a missed rep. Set that up before you ever need it.',
    steps: [
      'Warm up with lighter sets before your working weight.',
      'Use a spotter, or set the safety arms in a rack just above your chest.',
      'If you train alone, stop a rep or two before failure.',
      'Keep your thumbs wrapped around the bar.',
      'Stop the set and rest if you feel sharp pain in your shoulder, elbow, or chest.',
    ],
    mistakes: [
      'Benching heavy alone with no safeties.',
      'Skipping warm-ups when you are short on time.',
      'Pushing through sharp pain.',
    ],
  },
  {
    id: 'grip',
    title: 'Grip and wrists',
    minutes: 2,
    free: false,
    summary: 'Your wrists should stay straight so the force goes from your hands, through your forearms, and into the bar.',
    steps: [
      'Set the bar low in your palm, over the base of your forearm bones.',
      'Keep your knuckles pointing at the ceiling with your wrist stacked above your forearm.',
      'Squeeze the bar hard. A tight grip helps tighten your whole upper body.',
    ],
    mistakes: [
      'Letting the bar sit high in your fingers so your wrists bend back.',
      'A loose grip that lets the wrists collapse under heavy weight.',
    ],
  },
  {
    id: 'path',
    title: 'Unrack and bar path',
    minutes: 3,
    free: false,
    summary: 'The bar should travel the same way every rep. A repeatable path is stronger and kinder to your shoulders.',
    steps: [
      'Unrack with straight arms and move the bar over your shoulders before you lower it.',
      'Lower it under control to your lower chest, around the nipple line.',
      'Touch your chest lightly, then press up and slightly back toward your shoulders.',
      'Finish with the bar back over your shoulders and your arms locked out.',
    ],
    mistakes: [
      'Lowering the bar to your neck or upper chest.',
      'Pressing straight up and drifting forward over your face.',
      'Dropping the bar fast and bouncing it off your chest.',
    ],
  },
  {
    id: 'elbows',
    title: 'Elbow angle',
    minutes: 2,
    free: false,
    summary: 'Elbows flared straight out to the sides put stress on your shoulders. Tucking them a little makes the press stronger and safer.',
    steps: [
      'Aim to have your elbows about 45 to 75 degrees away from your body at the bottom, not 90.',
      'Think of bending the bar as you lower it, which helps keep your elbows in position.',
      'Keep your forearms close to vertical when the bar touches.',
    ],
    mistakes: [
      'Flaring your elbows out wide like a T.',
      'Tucking so hard that you lose your chest and shoulder drive.',
    ],
  },
  {
    id: 'legs',
    title: 'Leg drive',
    minutes: 2,
    free: false,
    summary: 'Your legs add stability and power to the press, even though you are lying down.',
    steps: [
      'Keep your feet planted and push them into the floor as you press.',
      'Think of pushing your body toward the head of the bench while your butt stays down.',
      'Start pushing as the bar leaves your chest, and keep tension through the whole rep.',
    ],
    mistakes: [
      'Letting your feet slide or tap.',
      'Pushing so hard that your butt lifts off the bench.',
    ],
  },
  {
    id: 'brace',
    title: 'Breathing and bracing',
    minutes: 2,
    free: false,
    summary: 'A big breath and a tight midsection make your torso a solid platform to press from.',
    steps: [
      'Take a big breath into your belly at the top of the rep.',
      'Hold it and keep your core tight while you lower the bar and begin to press.',
      'Breathe out near the top of the press, then reset your breath for the next rep.',
    ],
    mistakes: [
      'Breathing shallow into your chest.',
      'Letting all the air out at the bottom.',
    ],
  },
  {
    id: 'touch',
    title: 'Touch and pause',
    minutes: 2,
    free: false,
    summary: 'A short, controlled touch builds strength from the bottom and keeps your reps honest.',
    steps: [
      'Lower the bar to your chest under control.',
      'For paused reps, hold the bar on your chest for about one to two seconds with your body still tight.',
      'Press out of the pause without bouncing.',
    ],
    mistakes: [
      'Bouncing the bar off your ribs.',
      'Relaxing your upper back during the pause.',
    ],
  },
  {
    id: 'sticking',
    title: 'Fix your sticking point',
    minutes: 4,
    free: false,
    summary: 'Where the bar slows down tells you what to train. Match the fix to your weak spot.',
    steps: [
      'Off the chest: use paused bench, Spoto press, and a tighter setup with strong leg drive.',
      'Middle of the press: build your upper chest and shoulders with incline and overhead pressing, and use tempo reps.',
      'Lockout: build your triceps with close-grip bench, floor press, and pushdowns.',
      'Not sure: film a heavy set from the side and watch where the bar slows down.',
    ],
    mistakes: [
      'Only doing more heavy singles when the real weak point is something else.',
      'Changing your setup every week, which makes it hard to see progress.',
    ],
  },
  {
    id: 'wraps',
    title: 'Elbow wraps and sleeves',
    minutes: 2,
    free: false,
    summary: 'Sleeves and wraps are gear. They can add warmth and support, but they do not replace good technique.',
    steps: [
      'Use sleeves for warmth and comfort if your elbows feel stiff.',
      'Use tighter wraps only for your heaviest sets, not the whole session.',
      'Keep your gear choice consistent so your progress is easy to compare.',
      'Log wrapped lifts in the Wraps division on the leaderboard.',
    ],
    mistakes: [
      'Wrapping too tight and cutting off circulation or feeling numbness.',
      'Using gear to cover up a technique problem.',
    ],
  },
];

export default function Technique() {
  const params = useLocalSearchParams<{ sticking?: string }>();
  const pro = usePro();
  const [saved, setSaved] = useState('');
  const [open, setOpen] = useState<string | null>('setup');

  // Read the sticking point from your saved plan answers
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      AsyncStorage.getItem(ANSWERS_KEY)
        .then((raw) => {
          if (!raw || !alive) return;
          const a = JSON.parse(raw) as Record<string, string>;
          setSaved(a.sticking ?? '');
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [])
  );

  const sticking = params.sticking || saved;
  const hasSticking = sticking !== '' && sticking !== 'Not sure';

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.tag}>BENCHRISE</Text>
        <Text style={styles.title}>TECHNIQUE</Text>
        <Text style={styles.sub}>
          Short lessons on how to bench stronger and safer. {pro ? 'You have full access.' : 'Setup and Safety are free. The rest unlock with Pro.'}
        </Text>

        {LESSONS.map((l, idx) => {
          const locked = !l.free && !pro;
          const isOpen = open === l.id && !locked;
          const forYou = hasSticking && l.id === 'sticking';
          return (
            <View key={l.id} style={[styles.card, forYou ? styles.cardForYou : null]}>
              <Pressable
                style={styles.cardHead}
                onPress={() => {
                  if (locked) return;
                  setOpen(isOpen ? null : l.id);
                }}
              >
                <Text style={styles.num}>{String(idx + 1).padStart(2, '0')}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lessonTitle}>{l.title}</Text>
                  <Text style={styles.meta}>
                    {l.minutes} min read{l.free ? '  |  FREE' : ''}
                    {forYou ? '  |  FOR YOU' : ''}
                  </Text>
                </View>
                <Text style={locked ? styles.lock : styles.chevron}>{locked ? 'PRO' : isOpen ? '-' : '+'}</Text>
              </Pressable>

              {locked && <Text style={styles.lockedNote}>Subscribe to BenchRise Pro below to read this lesson.</Text>}

              {isOpen && (
                <View style={styles.body}>
                  <Text style={styles.summary}>{l.summary}</Text>

                  <Text style={styles.sectionLabel}>HOW TO DO IT</Text>
                  {l.steps.map((s, i) => (
                    <View key={s} style={styles.stepRow}>
                      <Text style={styles.stepNum}>{i + 1}</Text>
                      <Text style={styles.stepText}>{s}</Text>
                    </View>
                  ))}

                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>COMMON MISTAKES</Text>
                  {l.mistakes.map((m) => (
                    <View key={m} style={styles.stepRow}>
                      <Text style={styles.xMark}>x</Text>
                      <Text style={styles.stepText}>{m}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {!pro && (
          <View style={{ marginTop: 8 }}>
            <Paywall title="Unlock every lesson" perks={LESSON_PERKS} />
          </View>
        )}

        <Text style={styles.fine}>
          General training information, not medical advice or a substitute for in-person coaching. Warm up well, use a spotter or safeties, and stop if you feel sharp pain.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  container: { padding: 22, paddingBottom: 70 },
  tag: { color: '#ff4d2e', fontSize: 13, fontWeight: '900', letterSpacing: 5, marginTop: 6 },
  title: { color: '#fff', fontSize: 46, fontWeight: '900', letterSpacing: -1, marginTop: 6 },
  sub: { color: '#9a9aa6', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 18 },
  card: { backgroundColor: '#0d0d12', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e27', marginBottom: 10, overflow: 'hidden' },
  cardForYou: { borderColor: '#ff4d2e', backgroundColor: '#17100d' },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  num: { color: '#ff4d2e', fontSize: 20, fontWeight: '900', width: 40 },
  lessonTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  meta: { color: '#8c8c98', fontSize: 12, fontWeight: '700', marginTop: 3, letterSpacing: 0.5 },
  chevron: { color: '#ff4d2e', fontSize: 26, fontWeight: '900', width: 28, textAlign: 'center' },
  lock: { color: '#050507', backgroundColor: '#ffb02e', fontSize: 11, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  lockedNote: { color: '#6a6a75', fontSize: 13, paddingHorizontal: 16, paddingBottom: 14, marginTop: -4 },
  body: { paddingHorizontal: 16, paddingBottom: 18 },
  summary: { color: '#cfcfd6', fontSize: 15, lineHeight: 22, marginBottom: 16 },
  sectionLabel: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  stepRow: { flexDirection: 'row', marginBottom: 8 },
  stepNum: { color: '#ff4d2e', fontSize: 15, fontWeight: '900', width: 24 },
  xMark: { color: '#ff6b6b', fontSize: 15, fontWeight: '900', width: 24 },
  stepText: { flex: 1, color: '#b5b5c0', fontSize: 15, lineHeight: 21 },
  fine: { color: '#5f5f6a', fontSize: 12, lineHeight: 17, marginTop: 18 },
});