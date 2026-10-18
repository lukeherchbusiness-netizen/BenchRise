import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Unit, fmt, loadUnit, toLb } from '../../lib/units';

type Sex = 'Male' | 'Female' | 'Prefer not to say';
type Goal = 'bulk' | 'maintain' | 'cut';

const ACTIVITY = [
  { id: 'low', label: 'Low', sub: 'Desk job, little walking', factor: 1.2 },
  { id: 'light', label: 'Light', sub: 'Lifting 3 to 4 days a week', factor: 1.375 },
  { id: 'moderate', label: 'Moderate', sub: 'On your feet daily, lifting 4 to 5 days', factor: 1.55 },
  { id: 'high', label: 'High', sub: 'Physical job plus hard training', factor: 1.725 },
];

const GOALS: { id: Goal; label: string; sub: string }[] = [
  { id: 'bulk', label: 'Lean bulk', sub: 'Slight surplus to build muscle and strength' },
  { id: 'maintain', label: 'Maintain', sub: 'Hold your weight while you train' },
  { id: 'cut', label: 'Lose fat', sub: 'Moderate deficit, protein kept high' },
];

const SEXES: Sex[] = ['Male', 'Female', 'Prefer not to say'];

const SOURCES: { topic: string; cite: string; url: string }[] = [
  {
    topic: 'CALORIE ESTIMATE',
    cite: 'Mifflin MD, et al. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241-247.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  },
  {
    topic: 'ACTIVITY MULTIPLIER',
    cite: 'FAO/WHO/UNU. Human energy requirements (2001). Daily energy needs are resting energy multiplied by a physical activity level.',
    url: 'https://www.fao.org/4/y5686e/y5686e07.htm',
  },
  {
    topic: 'SURPLUS AND DEFICIT',
    cite: 'Aragon AA, et al. International Society of Sports Nutrition position stand: diets and body composition. J Int Soc Sports Nutr. 2017;14:16.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5470183/',
  },
  {
    topic: 'PROTEIN',
    cite: 'Jager R, et al. International Society of Sports Nutrition position stand: protein and exercise. J Int Soc Sports Nutr. 2017;14:20.',
    url: 'https://link.springer.com/article/10.1186/s12970-017-0177-8',
  },
  {
    topic: 'PROTEIN',
    cite: 'Morton RW, et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults. Br J Sports Med. 2018;52(6):376-384.',
    url: 'https://doi.org/10.1136/bjsports-2017-097608',
  },
  {
    topic: 'PROTEIN WHILE CUTTING',
    cite: 'Helms ER, et al. A systematic review of dietary protein during caloric restriction in resistance trained lean athletes: a case for higher intakes. Int J Sport Nutr Exerc Metab. 2014;24(2):127-138.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/24092765/',
  },
  {
    topic: 'FAT',
    cite: 'Dietary Guidelines for Americans. Healthy fat intake is about 20 to 35 percent of daily calories. Your fat target is a starting point near the low end of that range.',
    url: 'https://www.dietaryguidelines.gov/',
  },
];

const round = (x: number, step: number) => Math.round(x / step) * step;

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on ? styles.chipOn : null]} onPress={onPress}>
      <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{label}</Text>
    </Pressable>
  );
}

export default function Macros() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bodyweight?: string; age?: string; sex?: string }>();

  const [unit, setUnit] = useState<Unit>('lb');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState(params.age ?? '');
  const [sex, setSex] = useState<Sex>(
    params.sex === 'Male' || params.sex === 'Female' ? params.sex : 'Prefer not to say'
  );
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [cm, setCm] = useState('');
  const [activity, setActivity] = useState('light');
  const [goal, setGoal] = useState<Goal>('bulk');

  useEffect(() => {
    const run = async () => {
      const u = await loadUnit();
      setUnit(u);
      const lb = parseFloat(params.bodyweight ?? '');
      if (lb > 0) setWeight(fmt(lb, u));
    };
    run();
  }, []);

  const ageNum = parseFloat(age);
  const minor = ageNum > 0 && ageNum < 18;
  const effectiveGoal: Goal = minor && goal === 'cut' ? 'maintain' : goal;

  const result = useMemo(() => {
    const lb = toLb(parseFloat(weight), unit);
    const a = parseFloat(age);
    const totalIn = unit === 'kg' ? (parseFloat(cm) || 0) / 2.54 : (parseFloat(ft) || 0) * 12 + (parseFloat(inch) || 0);
    if (!(lb >= 70 && lb <= 600)) return null;
    if (!(a >= 13 && a <= 90)) return null;
    if (!(totalIn >= 48 && totalIn <= 90)) return null;

    const kg = lb * 0.45359237;
    const heightCm = totalIn * 2.54;
    const base = 10 * kg + 6.25 * heightCm - 5 * a;
    const bmr = sex === 'Male' ? base + 5 : sex === 'Female' ? base - 161 : base - 78;
    const factor = ACTIVITY.find((x) => x.id === activity)?.factor ?? 1.375;
    const maintenance = bmr * factor;

    let target = maintenance;
    if (effectiveGoal === 'bulk') target = maintenance * 1.1;
    if (effectiveGoal === 'cut') target = maintenance * 0.85;

    const floor = sex === 'Male' ? 1500 : sex === 'Female' ? 1200 : 1350;
    let floored = false;
    if (target < floor) {
      target = floor;
      floored = true;
    }

    const calories = round(target, 25);
    const protein = Math.round(lb * (effectiveGoal === 'cut' ? 1.1 : 1.0));
    const fat = Math.round(lb * 0.35);
    const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

    return {
      calories,
      maintenance: round(maintenance, 25),
      protein,
      fat,
      carbs,
      floored,
      pPct: Math.round(((protein * 4) / calories) * 100),
      fPct: Math.round(((fat * 9) / calories) * 100),
      cPct: Math.round(((carbs * 4) / calories) * 100),
    };
  }, [weight, age, ft, inch, cm, unit, sex, activity, effectiveGoal]);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>{'<  Back'}</Text>
        </Pressable>

        <Text style={styles.tag}>BENCHRISE</Text>
        <Text style={styles.title}>MACROS</Text>
        <Text style={styles.sub}>Daily calories and macros to fuel your bench training.</Text>

        <View style={styles.threeCol}>
          <View style={{ flex: 1.2 }}>
            <Text style={styles.label}>WEIGHT ({unit.toUpperCase()})</Text>
            <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={unit === 'kg' ? '80' : '180'} placeholderTextColor="#444450" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>AGE</Text>
            <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="25" placeholderTextColor="#444450" />
          </View>
        </View>

        <Text style={styles.label}>HEIGHT</Text>
        {unit === 'kg' ? (
          <View style={styles.threeCol}>
            <View style={styles.unitWrap}>
              <TextInput style={styles.unitInput} value={cm} onChangeText={setCm} keyboardType="decimal-pad" placeholder="178" placeholderTextColor="#444450" />
              <Text style={styles.unit}>cm</Text>
            </View>
          </View>
        ) : (
          <View style={styles.threeCol}>
            <View style={styles.unitWrap}>
              <TextInput style={styles.unitInput} value={ft} onChangeText={setFt} keyboardType="number-pad" placeholder="5" placeholderTextColor="#444450" />
              <Text style={styles.unit}>ft</Text>
            </View>
            <View style={styles.unitWrap}>
              <TextInput style={styles.unitInput} value={inch} onChangeText={setInch} keyboardType="number-pad" placeholder="10" placeholderTextColor="#444450" />
              <Text style={styles.unit}>in</Text>
            </View>
          </View>
        )}

        <Text style={styles.label}>SEX (FOR THE CALORIE FORMULA)</Text>
        <View style={styles.chipRow}>
          {SEXES.map((s) => (
            <Chip key={s} label={s} on={sex === s} onPress={() => setSex(s)} />
          ))}
        </View>

        <Text style={styles.label}>ACTIVITY LEVEL</Text>
        {ACTIVITY.map((a) => (
          <Pressable key={a.id} style={[styles.option, activity === a.id ? styles.optionOn : null]} onPress={() => setActivity(a.id)}>
            <Text style={[styles.optionTitle, activity === a.id ? styles.optionTitleOn : null]}>{a.label}</Text>
            <Text style={styles.optionSub}>{a.sub}</Text>
          </Pressable>
        ))}

        <Text style={styles.label}>GOAL</Text>
        {GOALS.filter((g) => !(minor && g.id === 'cut')).map((g) => (
          <Pressable key={g.id} style={[styles.option, effectiveGoal === g.id ? styles.optionOn : null]} onPress={() => setGoal(g.id)}>
            <Text style={[styles.optionTitle, effectiveGoal === g.id ? styles.optionTitleOn : null]}>{g.label}</Text>
            <Text style={styles.optionSub}>{g.sub}</Text>
          </Pressable>
        ))}

        {minor && (
          <View style={styles.note}>
            <Text style={styles.noteText}>
              Under 18: weight-loss targets aren't offered. Teens are still growing, so talk to a doctor or registered dietitian before changing how you eat.
            </Text>
          </View>
        )}

        {!result && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Enter your weight, age, and height to see your targets.</Text>
          </View>
        )}

        {result && (
          <View style={styles.resultCard}>
            <Text style={styles.cardLabel}>YOUR DAILY TARGET</Text>
            <View style={styles.calRow}>
              <Text style={styles.cal}>{result.calories}</Text>
              <Text style={styles.calUnit}>calories</Text>
            </View>
            <Text style={styles.maint}>Estimated maintenance: about {result.maintenance} calories</Text>

            <View style={styles.macroRow}>
              <View style={styles.macroBox}>
                <Text style={styles.macroLabel}>PROTEIN</Text>
                <Text style={[styles.macroValue, { color: '#ff4d2e' }]}>{result.protein}g</Text>
                <Text style={styles.macroPct}>{result.pPct}%</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={styles.macroLabel}>CARBS</Text>
                <Text style={[styles.macroValue, { color: '#ffb02e' }]}>{result.carbs}g</Text>
                <Text style={styles.macroPct}>{result.cPct}%</Text>
              </View>
              <View style={styles.macroBox}>
                <Text style={styles.macroLabel}>FAT</Text>
                <Text style={[styles.macroValue, { color: '#4da3ff' }]}>{result.fat}g</Text>
                <Text style={styles.macroPct}>{result.fPct}%</Text>
              </View>
            </View>

            <View style={styles.bar}>
              <View style={{ flex: Math.max(result.pPct, 1), backgroundColor: '#ff4d2e' }} />
              <View style={{ flex: Math.max(result.cPct, 1), backgroundColor: '#ffb02e' }} />
              <View style={{ flex: Math.max(result.fPct, 1), backgroundColor: '#4da3ff' }} />
            </View>

            {result.floored && (
              <Text style={styles.warn}>
                We raised this to a safe minimum. Going below it isn't recommended without a doctor or dietitian.
              </Text>
            )}

            <Text style={styles.tipTitle}>HOW TO USE IT</Text>
            <Text style={styles.tip}>Weigh yourself a few mornings a week and look at the weekly average. If your weight isn't moving the way you want after 2 to 3 weeks, change calories by about 100 to 200 and check again.</Text>
            <Text style={styles.tip}>Hit your protein target most days, and eat carbs around your heavy bench sessions for energy.</Text>
          </View>
        )}

        <View style={styles.sourcesCard}>
          <Text style={styles.srcHeading}>SOURCES</Text>
          <Text style={styles.srcIntro}>
            Where these numbers come from. Calories use the Mifflin-St Jeor equation times an activity multiplier, with about 10% extra to build and 15% less to lose fat. Protein is about 1.0 g per lb (1.1 g per lb when losing fat), which sits at the upper end of the ranges studied for lifters. Tap a source to read it.
          </Text>
          {SOURCES.map((s, i) => (
            <Pressable key={i} style={styles.srcItem} onPress={() => Linking.openURL(s.url).catch(() => {})}>
              <Text style={styles.srcTopic}>{s.topic}</Text>
              <Text style={styles.srcCite}>{s.cite}</Text>
              <Text style={styles.srcLink}>{s.url}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fine}>
          These are estimates from standard formulas, not medical advice. Real needs vary. Talk to a doctor or registered dietitian first if you have a medical condition, are pregnant or nursing, take medication that affects appetite or weight, or have a history of disordered eating.
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
  label: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 22, marginBottom: 8 },
  threeCol: { flexDirection: 'row', gap: 10 },
  input: { backgroundColor: '#0d0d12', color: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a34', paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '800' },
  unitWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d12', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a34', paddingHorizontal: 14 },
  unitInput: { flex: 1, color: '#fff', fontSize: 22, fontWeight: '800', paddingVertical: 12 },
  unit: { color: '#7d7d89', fontSize: 15, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#1e1e27', backgroundColor: '#0d0d12', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: '#ff4d2e', backgroundColor: '#24120d' },
  chipText: { color: '#8c8c98', fontSize: 14, fontWeight: '800' },
  chipTextOn: { color: '#fff' },
  option: { backgroundColor: '#0d0d12', borderRadius: 14, borderWidth: 1.5, borderColor: '#1e1e27', padding: 14, marginBottom: 8 },
  optionOn: { borderColor: '#ff4d2e', backgroundColor: '#24120d' },
  optionTitle: { color: '#b5b5c0', fontSize: 16, fontWeight: '800' },
  optionTitleOn: { color: '#fff' },
  optionSub: { color: '#7d7d89', fontSize: 13, marginTop: 2 },
  note: { backgroundColor: '#17140d', borderRadius: 14, borderWidth: 1, borderColor: '#352d1a', padding: 14, marginTop: 6 },
  noteText: { color: '#e5d6a8', fontSize: 14, lineHeight: 20 },
  empty: { borderWidth: 1.5, borderColor: '#1e1e27', borderStyle: 'dashed', borderRadius: 16, padding: 20, marginTop: 24 },
  emptyText: { color: '#6a6a75', fontSize: 14, textAlign: 'center' },
  resultCard: { backgroundColor: '#0d0d12', borderRadius: 22, borderWidth: 1.5, borderColor: '#ff4d2e', padding: 22, marginTop: 24 },
  cardLabel: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  calRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 },
  cal: { color: '#fff', fontSize: 64, fontWeight: '900', lineHeight: 68 },
  calUnit: { color: '#ff4d2e', fontSize: 18, fontWeight: '900', marginLeft: 8, marginBottom: 10 },
  maint: { color: '#9a9aa6', fontSize: 14, fontWeight: '600', marginTop: 4 },
  macroRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  macroBox: { flex: 1, backgroundColor: '#101016', borderRadius: 14, padding: 12 },
  macroLabel: { color: '#7d7d89', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  macroValue: { fontSize: 26, fontWeight: '900', marginTop: 4 },
  macroPct: { color: '#8c8c98', fontSize: 12, fontWeight: '700', marginTop: 2 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 16 },
  warn: { color: '#ffb02e', fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 14 },
  tipTitle: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 20 },
  tip: { color: '#b5b5c0', fontSize: 14, lineHeight: 21, marginTop: 8 },
  sourcesCard: { backgroundColor: '#0d0d12', borderRadius: 18, borderWidth: 1, borderColor: '#1e1e27', padding: 18, marginTop: 24 },
  srcHeading: { color: '#ff4d2e', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  srcIntro: { color: '#9a9aa6', fontSize: 13, lineHeight: 19, marginTop: 8 },
  srcItem: { borderTopWidth: 1, borderTopColor: '#1c1c24', paddingTop: 12, marginTop: 12 },
  srcTopic: { color: '#7d7d89', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  srcCite: { color: '#b5b5c0', fontSize: 13, lineHeight: 19, marginTop: 4 },
  srcLink: { color: '#4da3ff', fontSize: 12, lineHeight: 17, marginTop: 4, textDecorationLine: 'underline' },
  fine: { color: '#5f5f6a', fontSize: 12, lineHeight: 17, marginTop: 22 },
});