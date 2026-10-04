import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const APP_NAME = 'BenchRise';
const PRICES = { year: '$59.99 / year', month: '$9.99 / month' }; // placeholder prices
const STORAGE_KEY = 'benchrise.answers.v1';

type Question = { id: string; q: string; kind: 'choice' | 'number'; options?: string[]; unit?: string; placeholder?: string };
type Kind = 'build' | 'deload' | 'taper' | 'test';
type Exercise = { name: string; detail: string };
type Session = { title: string; focus: string; exercises: Exercise[] };
type Week = { number: number; kind: Kind; projected: number; tip: string; sessions: Session[] };
type Plan = { weeks: Week[]; notes: string[]; target: number; totalWeeks: number; days: number };
type Config = { variation: string; press: Exercise[]; arms: Exercise[] };

const QUESTIONS: Question[] = [
  { id: 'experience', q: 'How long have you been lifting?', kind: 'choice', options: ['Under 6 months', '6 to 18 months', '1.5 to 4 years', '4+ years'] },
  { id: 'age', q: 'How old are you?', kind: 'number', unit: 'years', placeholder: '25' },
  { id: 'sex', q: 'Which strength standards should we compare you to?', kind: 'choice', options: ['Male', 'Female', 'Prefer not to say'] },
  { id: 'bodyweight', q: 'What is your bodyweight?', kind: 'number', unit: 'lbs', placeholder: '180' },
  { id: 'bench', q: 'What is your current bench max?', kind: 'number', unit: 'lbs', placeholder: '225' },
  { id: 'goal', q: 'What is your bench goal?', kind: 'number', unit: 'lbs', placeholder: '275' },
  { id: 'timeline', q: 'How soon do you want to hit it?', kind: 'choice', options: ['8 weeks', '12 weeks', '6 months', 'No rush'] },
  { id: 'days', q: 'How many days a week can you train?', kind: 'choice', options: ['2 days', '3 days', '4 days', '5+ days'] },
  { id: 'sticking', q: 'Where does your bench get stuck?', kind: 'choice', options: ['Off the chest', 'Middle of the press', 'Lockout', 'Not sure'] },
  { id: 'wraps', q: 'Do you use elbow wraps or sleeves?', kind: 'choice', options: ['Never', 'Sometimes', 'Always'] },
];

const FEATURES = [
  ['01', 'A plan built for you', 'Weekly bench and accessory work matched to your goal and schedule.'],
  ['02', 'Technique coaching', 'Setup, bar path, leg drive, and fixes for your sticking point.'],
  ['03', 'Prove your PRs', 'Upload a video of every PR and climb the improvement leaderboard.'],
];

const PERKS = ['Every week of your full program', 'Auto deloads and test week attempts', 'All technique lessons', 'Leaderboard and PR video uploads'];

const KIND_COLOR: Record<Kind, string> = { build: '#ff4d2e', deload: '#4da3ff', taper: '#ffb02e', test: '#3ddc97' };
const KIND_LABEL: Record<Kind, string> = { build: 'Build week', deload: 'Deload week', taper: 'Taper week', test: 'Test week' };
const KIND_TIP: Record<Kind, string> = {
  build: 'Leave 1 to 2 reps in the tank on every set. If a set feels like a grind, drop 5 to 10 lb.',
  deload: 'Lighter week on purpose. Your body recovers and comes back stronger.',
  taper: 'Lower volume so you arrive fresh for test week.',
  test: 'Be rested, eat and sleep well, use a spotter or safeties, and only take attempts that feel good.',
};

const BACK: Exercise[] = [
  { name: 'Barbell or chest-supported row', detail: '4 x 8 to 10' },
  { name: 'Lat pulldown or pull-ups', detail: '3 x 8 to 12' },
  { name: 'Face pulls', detail: '3 x 15' },
];

const DISCLAIMER = 'General training information, not medical advice. Warm up well, use a spotter or safeties, and stop if you feel sharp pain.';

const round5 = (x: number) => Math.max(45, Math.round(x / 5) * 5);
const pct = (max: number, p: number) => round5((max * p) / 100);

function weeksFor(t: string): number {
  if (t === '8 weeks') return 8;
  if (t === '12 weeks') return 12;
  if (t === '6 months') return 24;
  return 16;
}
function daysFor(d: string): number {
  if (d.startsWith('2')) return 2;
  if (d.startsWith('3')) return 3;
  if (d.startsWith('4')) return 4;
  return 5;
}
function weeklyRate(exp: string): number {
  if (exp === 'Under 6 months') return 0.015;
  if (exp === '6 to 18 months') return 0.008;
  if (exp === '1.5 to 4 years') return 0.004;
  return 0.002;
}

function configFor(sticking: string): Config {
  if (sticking === 'Off the chest') {
    return { variation: 'Paused bench (2 sec pause)', press: [{ name: 'Spoto press', detail: '3 x 8' }, { name: 'Dumbbell bench press', detail: '3 x 10' }, { name: 'Cable fly', detail: '3 x 12' }], arms: [{ name: 'Triceps pushdown', detail: '3 x 12' }] };
  }
  if (sticking === 'Middle of the press') {
    return { variation: 'Tempo bench (3 sec down)', press: [{ name: 'Incline dumbbell press', detail: '3 x 10' }, { name: 'Seated dumbbell shoulder press', detail: '3 x 10' }], arms: [{ name: 'Skull crushers', detail: '3 x 10' }] };
  }
  if (sticking === 'Lockout') {
    return { variation: 'Close-grip bench', press: [{ name: 'Floor press', detail: '3 x 8' }, { name: 'Overhead triceps extension', detail: '3 x 12' }], arms: [{ name: 'Triceps pushdown', detail: '4 x 12' }, { name: 'Skull crushers', detail: '3 x 10' }] };
  }
  return { variation: 'Paused bench (1 sec pause)', press: [{ name: 'Dumbbell bench press', detail: '3 x 10' }, { name: 'Incline dumbbell press', detail: '3 x 10' }], arms: [{ name: 'Triceps pushdown', detail: '3 x 12' }] };
}

function heavyBench(kind: Kind, pos: number, pm: number, target: number): Exercise[] {
  if (kind === 'test') {
    return [
      { name: 'Warm-up', detail: `${round5(target * 0.6)} x 5, ${round5(target * 0.75)} x 3, ${round5(target * 0.85)} x 1` },
      { name: 'Attempt 1', detail: `${round5(target * 0.93)} lb x 1` },
      { name: 'Attempt 2', detail: `${round5(target * 0.97)} lb x 1` },
      { name: 'Attempt 3 (plan target)', detail: `${round5(target)} lb x 1` },
    ];
  }
  if (kind === 'taper') return [{ name: 'Bench press', detail: `3 x 3 @ ${pct(pm, 80)} lb` }];
  if (kind === 'deload') return [{ name: 'Bench press', detail: `3 x 5 @ ${pct(pm, 65)} lb` }];
  if (pos === 1) return [{ name: 'Bench press', detail: `4 x 6 @ ${pct(pm, 75)} lb` }];
  if (pos === 2) return [{ name: 'Bench press', detail: `4 x 4 @ ${pct(pm, 82)} lb` }];
  return [{ name: 'Bench press', detail: `5 x 2 @ ${pct(pm, 88)} lb` }];
}

function volumeBench(kind: Kind, pos: number, pm: number, variation: string): Exercise[] {
  if (kind === 'test') return [{ name: variation, detail: `3 x 5 @ ${pct(pm, 55)} lb (easy)` }];
  if (kind === 'taper') return [{ name: variation, detail: `3 x 5 @ ${pct(pm, 60)} lb` }];
  if (kind === 'deload') return [{ name: variation, detail: `3 x 6 @ ${pct(pm, 55)} lb` }];
  if (pos === 1) return [{ name: variation, detail: `4 x 8 @ ${pct(pm, 60)} lb` }];
  if (pos === 2) return [{ name: variation, detail: `4 x 6 @ ${pct(pm, 66)} lb` }];
  return [{ name: variation, detail: `4 x 5 @ ${pct(pm, 72)} lb` }];
}

function speedBench(kind: Kind, pos: number, pm: number): Exercise[] {
  if (kind !== 'build') return [{ name: 'Speed bench', detail: `5 x 3 @ ${pct(pm, 50)} lb` }];
  const p = pos === 1 ? 55 : pos === 2 ? 57 : 60;
  return [{ name: 'Speed bench', detail: `8 x 3 @ ${pct(pm, p)} lb` }];
}

function sessionsFor(days: number, kind: Kind, pos: number, pm: number, target: number, cfg: Config): Session[] {
  const heavy: Session = { title: 'Heavy bench', focus: 'Build top-end strength. Rest 3 to 4 minutes between bench sets.', exercises: [...heavyBench(kind, pos, pm, target), BACK[0]] };
  const volume: Session = { title: 'Volume bench', focus: 'More reps with a variation that targets your sticking point.', exercises: [...volumeBench(kind, pos, pm, cfg.variation), ...cfg.press, cfg.arms[0]] };
  const speed: Session = { title: 'Speed and technique', focus: 'Move the bar fast with perfect form. Rest about 60 seconds.', exercises: [...speedBench(kind, pos, pm), BACK[2]] };
  const back: Session = { title: 'Back and shoulders', focus: 'A strong upper back gives you a stable base to press from.', exercises: BACK };
  const arms: Session = { title: 'Triceps and shoulders', focus: 'Build the muscles that finish the press.', exercises: [...cfg.arms, { name: 'Lateral raises', detail: '3 x 15' }] };
  if (days === 2) return [heavy, volume];
  if (days === 3) return [heavy, volume, speed];
  if (days === 4) return [heavy, back, volume, speed];
  return [heavy, back, volume, arms, speed];
}

function buildPlan(a: Record<string, string>): Plan {
  const bench = parseFloat(a.bench);
  const goal = parseFloat(a.goal);
  const age = parseFloat(a.age);
  const total = weeksFor(a.timeline);
  const days = daysFor(a.days);
  const cfg = configFor(a.sticking);
  const gap = goal - bench;
  const maxGain = bench * Math.min(weeklyRate(a.experience) * total, 0.35) * 1.25;
  const gain = gap > 0 ? Math.min(gap, maxGain) : 0;
  const target = round5(bench + gain);

  const notes: string[] = [];
  if (gap <= 0) notes.push('Your goal is at or below your current max, so this plan focuses on building volume and keeping your strength.');
  else if (bench + gain < goal - 2) notes.push(`Your goal of ${goal} lb is aggressive for ${total} weeks at your experience level. This plan builds toward ${target} lb. Keep training after test week and you can keep pushing toward ${goal}.`);
  if (a.wraps !== 'Never') notes.push('You use elbow wraps or sleeves. Keep your setup the same every week so your progress is comparable. Wrapped lifts will have their own leaderboard division.');
  if (age >= 40) notes.push('Age 40 and up: spend extra time warming up your shoulders and elbows before heavy sets.');
  if (age < 18) notes.push('Under 18: train with a coach or experienced adult and skip max attempts without a spotter.');

  const weeks: Week[] = [];
  for (let w = 1; w <= total; w++) {
    let kind: Kind = 'build';
    if (w === total) kind = 'test';
    else if (w === total - 1) kind = 'taper';
    else if (w % 4 === 0) kind = 'deload';
    const pos = ((w - 1) % 4) + 1;
    const pm = bench + gain * ((w - 1) / (total - 1));
    weeks.push({ number: w, kind, projected: round5(pm), tip: KIND_TIP[kind], sessions: sessionsFor(days, kind, pos, pm, target, cfg) });
  }
  return { weeks, notes, target, totalWeeks: total, days };
}

export default function HomeScreen() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [weekIdx, setWeekIdx] = useState(0);
  const [pro, setPro] = useState(false);
  const [billing, setBilling] = useState<'year' | 'month'>('year');

  const total = QUESTIONS.length;

  // Load saved answers when the app opens
  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Record<string, string>;
          const complete = QUESTIONS.every((q) => saved[q.id] && String(saved[q.id]).length > 0);
          if (complete) {
            setAnswers(saved);
            setStep(QUESTIONS.length);
          }
        }
      } catch (e) {
        // ignore: the app just starts fresh
      }
      setLoaded(true);
    };
    load();
  }, []);

  // Save answers once the plan is built
  useEffect(() => {
    if (step === total) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(answers)).catch(() => {});
    }
  }, [step, total, answers]);

  const question = step >= 0 && step < total ? QUESTIONS[step] : null;
  const answer = question ? answers[question.id] ?? '' : '';
  const canContinue = question ? (question.kind === 'number' ? parseFloat(answer) > 0 : answer !== '') : true;

  const plan = useMemo(() => (step === total ? buildPlan(answers) : null), [step, total, answers]);
  const week = plan ? plan.weeks[weekIdx] : null;
  const locked = !pro && weekIdx > 0;

  const setAnswer = (value: string) => {
    if (question) setAnswers({ ...answers, [question.id]: value });
  };
  const restart = () => {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    setAnswers({});
    setWeekIdx(0);
    setStep(-1);
  };

  const openTechnique = () =>
    router.push({
      pathname: '/technique',
      params: { pro: pro ? '1' : '0', sticking: answers.sticking ?? '' },
    });

  const openLog = () =>
    router.push({
      pathname: '/log',
      params: { bench: answers.bench ?? '' },
    });

  const openMacros = () =>
    router.push({
      pathname: '/macros',
      params: {
        bodyweight: answers.bodyweight ?? '',
        age: answers.age ?? '',
        sex: answers.sex ?? '',
      },
    });

  // DEMO ONLY: this flips a switch and charges nothing.
  // Replace with a real RevenueCat purchase call later.
  const unlock = () => setPro(true);

  const nextStyle = [styles.button, styles.next, !canContinue ? styles.disabled : null];

  if (!loaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  const paywall = (
    <View style={styles.paywall}>
      <Text style={styles.proTag}>BENCHRISE PRO</Text>
      <Text style={styles.paywallTitle}>Unlock your full program</Text>
      {PERKS.map((p) => (
        <Text key={p} style={styles.perk}>+  {p}</Text>
      ))}
      <View style={styles.planRow}>
        <Pressable style={[styles.planBox, billing === 'year' ? styles.planOn : null]} onPress={() => setBilling('year')}>
          <Text style={styles.badge}>BEST VALUE</Text>
          <Text style={styles.planName}>Yearly</Text>
          <Text style={styles.planPrice}>{PRICES.year}</Text>
        </Pressable>
        <Pressable style={[styles.planBox, billing === 'month' ? styles.planOn : null]} onPress={() => setBilling('month')}>
          <Text style={styles.badgeOff}> </Text>
          <Text style={styles.planName}>Monthly</Text>
          <Text style={styles.planPrice}>{PRICES.month}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.button} onPress={unlock}>
        <Text style={styles.buttonText}>Unlock all {plan?.totalWeeks} weeks</Text>
      </Pressable>
      <Text style={styles.fine}>Demo mode: no real charge yet. Subscriptions will renew until cancelled. Restore purchases, Terms, and Privacy links go here.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {step === -1 && (
          <View>
            <View style={styles.logoRow}>
              <View style={styles.logo} />
              <Text style={styles.brand}>{APP_NAME.toUpperCase()}</Text>
            </View>
            <Text style={styles.hero}>LIFT</Text>
            <Text style={styles.hero}>MORE.</Text>
            <Text style={[styles.hero, styles.heroAccent]}>PROVE IT.</Text>
            <Text style={styles.body}>
              Answer 10 quick questions. Get a bench program built around your goal, then compete on a leaderboard ranked by who improves the most.
            </Text>
            <View style={styles.chips}>
              {['10 questions', 'Custom plan', 'Leaderboard'].map((c) => (
                <View key={c} style={styles.chip}>
                  <Text style={styles.chipText}>{c}</Text>
                </View>
              ))}
            </View>
            {FEATURES.map(([n, title, text]) => (
              <View key={title} style={styles.feature}>
                <Text style={styles.featureNum}>{n}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{title}</Text>
                  <Text style={styles.featureText}>{text}</Text>
                </View>
              </View>
            ))}
            <Pressable style={styles.button} onPress={() => setStep(0)}>
              <Text style={styles.buttonText}>BUILD MY PLAN</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={openLog}>
              <Text style={styles.ghostText}>WORKOUT LOG</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={openMacros}>
              <Text style={styles.ghostText}>MACRO CALCULATOR</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={openTechnique}>
              <Text style={styles.ghostText}>TECHNIQUE LESSONS</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={() => router.push('/leaderboard')}>
              <Text style={styles.ghostText}>VIEW LEADERBOARD</Text>
            </Pressable>
            <View style={styles.ghostRow}>
              <Pressable style={[styles.ghost, styles.ghostHalf]} onPress={() => router.push('/timer')}>
                <Text style={styles.ghostText}>REST TIMER</Text>
              </Pressable>
              <Pressable style={[styles.ghost, styles.ghostHalf]} onPress={() => router.push('/plates')}>
                <Text style={styles.ghostText}>PLATES</Text>
              </Pressable>
            </View>
            <Pressable style={styles.back} onPress={() => router.push('/settings')}>
              <Text style={styles.backText}>Settings</Text>
            </Pressable>
          </View>
        )}

        {question && (
          <View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${((step + 1) / total) * 100}%` }]} />
            </View>
            <Text style={styles.step}>QUESTION {step + 1} / {total}</Text>
            <Text style={styles.question}>{question.q}</Text>

            {question.kind === 'choice' &&
              question.options?.map((opt) => (
                <Pressable key={opt} style={[styles.option, answer === opt ? styles.optionOn : null]} onPress={() => setAnswer(opt)}>
                  <Text style={[styles.optionText, answer === opt ? styles.optionTextOn : null]}>{opt}</Text>
                </Pressable>
              ))}

            {question.kind === 'number' && (
              <View style={styles.inputWrap}>
                <TextInput style={styles.input} value={answer} onChangeText={setAnswer} keyboardType="numeric" placeholder={question.placeholder} placeholderTextColor="#444450" />
                <Text style={styles.unit}>{question.unit}</Text>
              </View>
            )}

            <View style={styles.navRow}>
              <Pressable style={styles.back} onPress={() => setStep(step - 1)}>
                <Text style={styles.backText}>Back</Text>
              </Pressable>
              <Pressable style={nextStyle} disabled={!canContinue} onPress={() => setStep(step + 1)}>
                <Text style={styles.buttonText}>{step === total - 1 ? 'BUILD MY PLAN' : 'CONTINUE'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {plan && week && (
          <View>
            <View style={styles.logoRow}>
              <View style={styles.logo} />
              <Text style={styles.brand}>{APP_NAME.toUpperCase()}</Text>
              {pro && <Text style={styles.proPill}>PRO</Text>}
            </View>

            <View style={styles.goalCard}>
              <Text style={styles.cardLabel}>YOUR GOAL</Text>
              <View style={styles.goalRow}>
                <Text style={styles.goalFrom}>{answers.bench}</Text>
                <Text style={styles.goalArrow}>{'>'}</Text>
                <Text style={styles.goalTo}>{plan.target}</Text>
                <Text style={styles.goalUnit}>lb</Text>
              </View>
              <Text style={styles.goalSub}>{plan.totalWeeks} weeks  |  {plan.days} days a week</Text>
            </View>

            {plan.notes.map((n) => (
              <View key={n} style={styles.note}>
                <Text style={styles.noteText}>{n}</Text>
              </View>
            ))}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
              {plan.weeks.map((wk, i) => (
                <Pressable key={wk.number} style={[styles.tab, i === weekIdx ? styles.tabOn : null]} onPress={() => setWeekIdx(i)}>
                  <Text style={[styles.tabText, i === weekIdx ? styles.tabTextOn : null]}>W{wk.number}</Text>
                  <View style={[styles.tabDot, { backgroundColor: !pro && i > 0 ? '#33333d' : KIND_COLOR[wk.kind] }]} />
                </Pressable>
              ))}
            </ScrollView>

            <View style={[styles.weekCard, { borderColor: KIND_COLOR[week.kind] }]}>
              <Text style={[styles.kind, { color: KIND_COLOR[week.kind] }]}>
                {KIND_LABEL[week.kind].toUpperCase()}{!pro && weekIdx === 0 ? '  |  FREE PREVIEW' : ''}
              </Text>
              <Text style={styles.weekTitle}>Week {week.number}</Text>
              <Text style={styles.detail}>Working max: {week.projected} lb</Text>
              {!locked && <Text style={styles.tip}>{week.tip}</Text>}
            </View>

            {locked ? (
              paywall
            ) : (
              <View>
                {week.sessions.map((s, i) => (
                  <View key={s.title} style={styles.sessionCard}>
                    <Text style={styles.sessionDay}>DAY {i + 1}</Text>
                    <Text style={styles.sessionTitle}>{s.title}</Text>
                    <Text style={styles.sessionFocus}>{s.focus}</Text>
                    {s.exercises.map((ex, j) => (
                      <View key={`${ex.name}-${j}`} style={styles.exRow}>
                        <Text style={styles.exName}>{ex.name}</Text>
                        <Text style={styles.exDetail}>{ex.detail}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                {!pro && paywall}
              </View>
            )}

            <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
            <Pressable style={styles.button} onPress={openLog}>
              <Text style={styles.buttonText}>WORKOUT LOG</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={openMacros}>
              <Text style={styles.ghostText}>MACRO CALCULATOR</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={openTechnique}>
              <Text style={styles.ghostText}>TECHNIQUE LESSONS</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={() => router.push('/leaderboard')}>
              <Text style={styles.ghostText}>VIEW LEADERBOARD</Text>
            </Pressable>
            <View style={styles.ghostRow}>
              <Pressable style={[styles.ghost, styles.ghostHalf]} onPress={() => router.push('/timer')}>
                <Text style={styles.ghostText}>REST TIMER</Text>
              </Pressable>
              <Pressable style={[styles.ghost, styles.ghostHalf]} onPress={() => router.push('/plates')}>
                <Text style={styles.ghostText}>PLATES</Text>
              </Pressable>
            </View>
            <Pressable style={styles.back} onPress={() => router.push('/settings')}>
              <Text style={styles.backText}>Settings</Text>
            </Pressable>
            <Pressable style={styles.backTight} onPress={restart}>
              <Text style={styles.backText}>Start over</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const glow = { shadowColor: '#ff4d2e', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10 };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  container: { padding: 22, paddingBottom: 70 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  logo: { width: 16, height: 16, borderRadius: 4, backgroundColor: '#ff4d2e', marginRight: 10, transform: [{ rotate: '45deg' }], ...glow },
  brand: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 5 },
  proPill: { marginLeft: 10, color: '#050507', backgroundColor: '#ffb02e', fontSize: 11, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  hero: { color: '#fff', fontSize: 68, fontWeight: '900', lineHeight: 70, letterSpacing: -2 },
  heroAccent: { color: '#ff4d2e', marginBottom: 6 },
  body: { color: '#9a9aa6', fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  chip: { borderWidth: 1, borderColor: '#2c2c36', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: '#cfcfd6', fontSize: 12, fontWeight: '700' },
  feature: { flexDirection: 'row', backgroundColor: '#0d0d12', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e27', padding: 16, marginBottom: 10 },
  featureNum: { color: '#ff4d2e', fontSize: 22, fontWeight: '900', width: 44 },
  featureTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  featureText: { color: '#8c8c98', fontSize: 14, lineHeight: 20, marginTop: 3 },
  button: { backgroundColor: '#ff4d2e', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 20, ...glow },
  disabled: { opacity: 0.3 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  track: { height: 5, backgroundColor: '#1e1e27', borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  fill: { height: 5, backgroundColor: '#ff4d2e', borderRadius: 3 },
  step: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 26 },
  question: { color: '#fff', fontSize: 34, fontWeight: '900', lineHeight: 38, marginTop: 10, marginBottom: 26, letterSpacing: -0.5 },
  option: { backgroundColor: '#0d0d12', borderRadius: 14, borderWidth: 1.5, borderColor: '#1e1e27', padding: 18, marginBottom: 10 },
  optionOn: { borderColor: '#ff4d2e', backgroundColor: '#24120d' },
  optionText: { color: '#b5b5c0', fontSize: 17, fontWeight: '700' },
  optionTextOn: { color: '#fff' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d12', borderRadius: 14, borderWidth: 1.5, borderColor: '#ff4d2e', paddingHorizontal: 16 },
  input: { flex: 1, color: '#fff', fontSize: 40, fontWeight: '900', paddingVertical: 14 },
  unit: { color: '#7d7d89', fontSize: 16, fontWeight: '700' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  next: { flex: 1 },
  back: { paddingVertical: 18, paddingHorizontal: 20, marginTop: 20 },
  backTight: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: '#8c8c98', fontSize: 16, fontWeight: '700' },
  goalCard: { backgroundColor: '#0d0d12', borderRadius: 22, borderWidth: 1, borderColor: '#2a1812', padding: 22, marginTop: 20, ...glow, shadowOpacity: 0.25 },
  cardLabel: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  goalRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
  goalFrom: { color: '#6a6a75', fontSize: 38, fontWeight: '900' },
  goalArrow: { color: '#ff4d2e', fontSize: 32, fontWeight: '900', marginHorizontal: 12, marginBottom: 4 },
  goalTo: { color: '#fff', fontSize: 64, fontWeight: '900', lineHeight: 66 },
  goalUnit: { color: '#ff4d2e', fontSize: 20, fontWeight: '900', marginLeft: 6, marginBottom: 8 },
  goalSub: { color: '#9a9aa6', fontSize: 14, fontWeight: '600', marginTop: 8 },
  note: { backgroundColor: '#17140d', borderRadius: 14, borderWidth: 1, borderColor: '#352d1a', padding: 14, marginTop: 10 },
  noteText: { color: '#e5d6a8', fontSize: 14, lineHeight: 20 },
  tabs: { marginTop: 16, marginBottom: 14, flexGrow: 0 },
  tab: { backgroundColor: '#0d0d12', borderRadius: 12, borderWidth: 1, borderColor: '#1e1e27', paddingVertical: 10, paddingHorizontal: 14, marginRight: 8, alignItems: 'center' },
  tabOn: { backgroundColor: '#24120d', borderColor: '#ff4d2e' },
  tabText: { color: '#8c8c98', fontSize: 15, fontWeight: '800' },
  tabTextOn: { color: '#fff' },
  tabDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  weekCard: { backgroundColor: '#0d0d12', borderRadius: 20, borderWidth: 1.5, padding: 20, marginBottom: 14 },
  kind: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  weekTitle: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 6 },
  detail: { color: '#cfcfd6', fontSize: 16, fontWeight: '600', marginTop: 4 },
  tip: { color: '#9a9aa6', fontSize: 14, lineHeight: 20, marginTop: 10 },
  sessionCard: { backgroundColor: '#0d0d12', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e27', padding: 18, marginBottom: 12 },
  sessionDay: { color: '#ff4d2e', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  sessionTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  sessionFocus: { color: '#8c8c98', fontSize: 14, lineHeight: 20, marginTop: 4, marginBottom: 8 },
  exRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1a1a22' },
  exName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  exDetail: { color: '#ff8a70', fontSize: 15, fontWeight: '700', marginTop: 2 },
  paywall: { backgroundColor: '#0d0d12', borderRadius: 22, borderWidth: 1.5, borderColor: '#ff4d2e', padding: 22, marginTop: 6, ...glow, shadowOpacity: 0.3 },
  proTag: { color: '#ffb02e', fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  paywallTitle: { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 32, marginTop: 8, marginBottom: 14 },
  perk: { color: '#cfcfd6', fontSize: 15, fontWeight: '600', marginBottom: 8 },
  planRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  planBox: { flex: 1, borderWidth: 1.5, borderColor: '#2a2a34', borderRadius: 14, padding: 14, backgroundColor: '#101016' },
  planOn: { borderColor: '#ff4d2e', backgroundColor: '#24120d' },
  badge: { color: '#050507', backgroundColor: '#ffb02e', fontSize: 10, fontWeight: '900', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  badgeOff: { fontSize: 10, paddingVertical: 2, marginBottom: 6 },
  planName: { color: '#fff', fontSize: 17, fontWeight: '900' },
  planPrice: { color: '#9a9aa6', fontSize: 13, fontWeight: '600', marginTop: 2 },
  fine: { color: '#6a6a75', fontSize: 11, lineHeight: 16, marginTop: 14 },
  ghost: { borderWidth: 1.5, borderColor: '#2c2c36', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  ghostRow: { flexDirection: 'row', gap: 10 },
  ghostHalf: { flex: 1 },
  ghostText: { color: '#cfcfd6', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  disclaimer: { color: '#5f5f6a', fontSize: 12, lineHeight: 17, marginTop: 16 },
});