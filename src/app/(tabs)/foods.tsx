import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadPro, savePro } from '../../lib/pro';

type Food = { name: string; serving: string; cal: number; p: number; c: number; f: number };
type Entry = Food & { id: string; servings: number };
type Targets = { cal: number; p: number; c: number; f: number };

const LOG_KEY = 'benchrise.foodlog.v1';
const TARGET_KEY = 'benchrise.foodtargets.v1';
const DEFAULT_TARGETS: Targets = { cal: 2800, p: 180, c: 300, f: 80 };

const F = (name: string, serving: string, cal: number, p: number, c: number, f: number): Food => ({
  name, serving, cal, p, c, f,
});

const FOODS: Food[] = [
  F('Chicken breast, cooked', '100 g', 165, 31, 0, 3.6),
  F('Chicken thigh, cooked', '100 g', 209, 26, 0, 11),
  F('Ground beef 90/10, cooked', '100 g', 217, 26, 0, 12),
  F('Sirloin steak, cooked', '100 g', 210, 30, 0, 9),
  F('Ground turkey 93%, cooked', '100 g', 203, 27, 0, 10),
  F('Salmon, cooked', '100 g', 206, 22, 0, 12),
  F('Tilapia, cooked', '100 g', 128, 26, 0, 2.7),
  F('Shrimp, cooked', '100 g', 99, 24, 0.2, 0.3),
  F('Tuna, canned in water', '100 g', 116, 26, 0, 1),
  F('Turkey deli slices', '3 oz', 80, 14, 2, 1),
  F('Bacon', '2 slices', 86, 6, 0, 7),
  F('Egg, large', '1 egg', 72, 6.3, 0.4, 4.8),
  F('Egg whites', '100 g', 52, 11, 0.7, 0.2),
  F('Greek yogurt, nonfat', '170 g', 100, 17, 6, 0.7),
  F('Cottage cheese, low fat', '100 g', 82, 11, 3.4, 2.3),
  F('Whey protein powder', '1 scoop', 120, 24, 3, 1.5),
  F('Protein bar', '1 bar', 200, 20, 22, 7),
  F('Milk, 2%', '1 cup', 122, 8, 12, 4.8),
  F('Milk, whole', '1 cup', 149, 8, 12, 8),
  F('Chocolate milk', '1 cup', 208, 8, 26, 8),
  F('Cheddar cheese', '1 oz', 113, 7, 0.4, 9),
  F('White rice, cooked', '1 cup', 205, 4.3, 45, 0.4),
  F('Brown rice, cooked', '1 cup', 216, 5, 45, 1.8),
  F('Oats, dry', '1/2 cup', 150, 5, 27, 3),
  F('Pasta, cooked', '1 cup', 220, 8, 43, 1.3),
  F('Whole wheat bread', '1 slice', 81, 4, 14, 1.1),
  F('Bagel, plain', '1 bagel', 270, 10, 53, 1.5),
  F('Rice cake', '1 cake', 35, 0.7, 7.3, 0.3),
  F('Baked potato', '1 medium', 161, 4.3, 37, 0.2),
  F('Sweet potato', '1 medium', 112, 2, 26, 0.1),
  F('Black beans, cooked', '1/2 cup', 114, 7.6, 20, 0.5),
  F('Lentils, cooked', '1/2 cup', 115, 9, 20, 0.4),
  F('Banana', '1 medium', 105, 1.3, 27, 0.4),
  F('Apple', '1 medium', 95, 0.5, 25, 0.3),
  F('Orange', '1 medium', 62, 1.2, 15, 0.2),
  F('Blueberries', '1 cup', 84, 1.1, 21, 0.5),
  F('Broccoli', '1 cup', 31, 2.5, 6, 0.3),
  F('Spinach, raw', '1 cup', 7, 0.9, 1.1, 0.1),
  F('Avocado', '1/2 medium', 160, 2, 9, 15),
  F('Almonds', '1 oz', 164, 6, 6, 14),
  F('Peanut butter', '2 tbsp', 188, 8, 6, 16),
  F('Olive oil', '1 tbsp', 119, 0, 0, 13.5),
  F('Butter', '1 tbsp', 102, 0.1, 0, 11.5),
  F('Honey', '1 tbsp', 64, 0.1, 17, 0),
  F('Cheese pizza', '1 slice', 285, 12, 36, 10),
  F('Cheeseburger', '1 burger', 303, 15, 33, 13),
  F('French fries', '1 medium', 365, 4, 48, 17),
  F('Ice cream', '1/2 cup', 137, 2.3, 16, 7.3),
  F('Soda', '12 oz', 140, 0, 39, 0),
  F('Beer', '12 oz', 153, 1.6, 13, 0),
];

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const num = (s: string) => {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

// Turns an Open Food Facts product into one of our Food items.
function offToFood(p: any, fallbackName?: string): Food | null {
  const n = p?.nutriments;
  if (!n) return null;
  const hasServing = n['energy-kcal_serving'] != null;
  const sfx = hasServing ? '_serving' : '_100g';
  const kcal = Number(n['energy-kcal' + sfx]);
  if (isNaN(kcal)) return null;
  const grams = (key: string) => {
    const v = Number(n[key + sfx]);
    return isNaN(v) ? 0 : r1(v);
  };
  const base = (p.product_name || fallbackName || '').toString().trim();
  if (!base) return null;
  const brand = p.brands ? String(p.brands).split(',')[0].trim() : '';
  return {
    name: brand ? `${base} (${brand})` : base,
    serving: hasServing ? String(p.serving_size || '1 serving') : '100 g',
    cal: Math.round(kcal),
    p: grams('proteins'),
    c: grams('carbohydrates'),
    f: grams('fat'),
  };
}

function Bar({ label, value, target, color, unit }: { label: string; value: number; target: number; color: string; unit: string }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <View style={{ marginTop: 12 }}>
      <View style={styles.barTop}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>
          {Math.round(value)} / {target}
          {unit}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function FoodsScreen() {
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);
  const [query, setQuery] = useState('');
  const [showTargets, setShowTargets] = useState(false);
  const [cName, setCName] = useState('');
  const [cCal, setCCal] = useState('');
  const [cP, setCP] = useState('');
  const [cC, setCC] = useState('');
  const [cF, setCF] = useState('');

  const [online, setOnline] = useState<Food[]>([]);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineMsg, setOnlineMsg] = useState('');

  const [permission, requestPermission] = useCameraPermissions();
  const [scanOpen, setScanOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const pro = await loadPro();
        let list: Entry[] = [];
        let t = DEFAULT_TARGETS;
        try {
          const raw = await AsyncStorage.getItem(LOG_KEY);
          if (raw) {
            const d = JSON.parse(raw);
            if (d.date === todayKey()) list = d.entries ?? [];
          }
          const tr = await AsyncStorage.getItem(TARGET_KEY);
          if (tr) t = { ...DEFAULT_TARGETS, ...JSON.parse(tr) };
        } catch {}
        if (alive) {
          setIsPro(pro);
          setEntries(list);
          setTargets(t);
        }
      })();
      return () => {
        alive = false;
      };
    }, [])
  );

  const persist = (list: Entry[]) => {
    setEntries(list);
    AsyncStorage.setItem(LOG_KEY, JSON.stringify({ date: todayKey(), entries: list })).catch(() => {});
  };

  const updateTarget = (key: keyof Targets, text: string) => {
    const next = { ...targets, [key]: num(text) };
    setTargets(next);
    AsyncStorage.setItem(TARGET_KEY, JSON.stringify(next)).catch(() => {});
  };

  const addFood = (food: Food) => {
    const existing = entries.find((e) => e.name === food.name && e.serving === food.serving);
    if (existing) {
      persist(entries.map((e) => (e.id === existing.id ? { ...e, servings: e.servings + 1 } : e)));
    } else {
      const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
      persist([...entries, { ...food, id, servings: 1 }]);
    }
  };

  const change = (id: string, delta: number) => {
    persist(
      entries
        .map((e) => (e.id === id ? { ...e, servings: e.servings + delta } : e))
        .filter((e) => e.servings > 0)
    );
  };

  const addCustom = () => {
    if (!cName.trim()) return;
    addFood({
      name: cName.trim(),
      serving: '1 serving',
      cal: num(cCal),
      p: num(cP),
      c: num(cC),
      f: num(cF),
    });
    setCName('');
    setCCal('');
    setCP('');
    setCC('');
    setCF('');
  };

  const unlock = async () => {
    await savePro(true);
    setIsPro(true);
  };

  const searchOnline = async () => {
    const term = query.trim();
    if (!term) {
      setOnlineMsg('Type a food name first.');
      return;
    }
    setOnlineBusy(true);
    setOnlineMsg('');
    setOnline([]);
    try {
      const url =
        'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=20' +
        '&fields=product_name,brands,nutriments,serving_size&search_terms=' +
        encodeURIComponent(term);
      const res = await fetch(url, { headers: { 'User-Agent': 'BenchRise/1.0 (fitness app)' } });
      const data = await res.json();
      const list: Food[] = (data.products ?? [])
        .map((p: any) => offToFood(p))
        .filter((x: Food | null): x is Food => x !== null);
      setOnline(list);
      if (list.length === 0) setOnlineMsg('No results. Try another word, or add a custom food below.');
    } catch {
      setOnlineMsg('Could not reach the food database. Check your connection and try again.');
    }
    setOnlineBusy(false);
  };

  const openScan = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) return;
    }
    setScanned(false);
    setScanMsg('Point the camera at a barcode');
    setScanOpen(true);
  };

  const onScan = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScanMsg('Looking up ' + data + '...');
    try {
      const url =
        'https://world.openfoodfacts.org/api/v2/product/' +
        encodeURIComponent(data) +
        '.json?fields=product_name,brands,nutriments,serving_size';
      const res = await fetch(url, { headers: { 'User-Agent': 'BenchRise/1.0 (fitness app)' } });
      const json = await res.json();
      const food = json?.status === 1 ? offToFood(json.product, 'Scanned food') : null;
      if (food) {
        addFood(food);
        setScanOpen(false);
      } else {
        setScanMsg('Not found in the database. Tap Scan again, or add it as a custom food.');
      }
    } catch {
      setScanMsg('Could not look that up. Check your connection and tap Scan again.');
    }
  };

  const total = entries.reduce(
    (a, e) => ({
      cal: a.cal + e.cal * e.servings,
      p: a.p + e.p * e.servings,
      c: a.c + e.c * e.servings,
      f: a.f + e.f * e.servings,
    }),
    { cal: 0, p: 0, c: 0, f: 0 }
  );

  const q = query.trim().toLowerCase();
  const results = (q ? FOODS.filter((f) => f.name.toLowerCase().includes(q)) : FOODS.slice(0, 8)).slice(0, 12);

  if (isPro === null) {
    return <SafeAreaView style={styles.safe} />;
  }

  if (!isPro) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.pad}>
          <Text style={styles.title}>FOOD TRACKER</Text>
          <View style={styles.lockCard}>
            <Text style={styles.lockBadge}>PRO</Text>
            <Text style={styles.lockTitle}>Hit your macros every day</Text>
            <Text style={styles.lockText}>
              Log what you eat, see calories, protein, carbs and fat add up live, and track your progress against your daily targets.
            </Text>
            <Text style={styles.lockPoint}>• Scan barcodes for exact nutrition</Text>
            <Text style={styles.lockPoint}>• Search millions of foods</Text>
            <Text style={styles.lockPoint}>• Add your own custom foods</Text>
            <Text style={styles.lockPoint}>• Live progress bars for every macro</Text>
            <Pressable style={styles.cta} onPress={unlock}>
              <Text style={styles.ctaText}>UNLOCK PRO · $10/MONTH</Text>
            </Pressable>
            <Text style={styles.fine}>Demo mode: nothing is charged yet.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>FOOD TRACKER</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>TODAY</Text>
          <Text style={styles.bigNum}>
            {Math.round(total.cal)} <Text style={styles.bigUnit}>/ {targets.cal} cal</Text>
          </Text>
          <Bar label="Calories" value={total.cal} target={targets.cal} color="#ff4d2e" unit="" />
          <Bar label="Protein" value={total.p} target={targets.p} color="#ffb02e" unit="g" />
          <Bar label="Carbs" value={total.c} target={targets.c} color="#4da3ff" unit="g" />
          <Bar label="Fat" value={total.f} target={targets.f} color="#b36bff" unit="g" />
          <Pressable onPress={() => setShowTargets(!showTargets)}>
            <Text style={styles.link}>{showTargets ? 'Hide targets' : 'Edit daily targets'}</Text>
          </Pressable>
          {showTargets && (
            <View style={styles.row}>
              {(
                [
                  ['cal', 'Cal'],
                  ['p', 'Protein'],
                  ['c', 'Carbs'],
                  ['f', 'Fat'],
                ] as [keyof Targets, string][]
              ).map(([k, label]) => (
                <View key={k} style={styles.col}>
                  <Text style={styles.miniLabel}>{label}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={targets[k] ? String(targets[k]) : ''}
                    onChangeText={(t) => updateTarget(k, t)}
                    placeholderTextColor="#5f5f6a"
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>EATEN TODAY</Text>
          {entries.length === 0 && <Text style={styles.empty}>Nothing logged yet. Add a food below.</Text>}
          {entries.map((e) => (
            <View key={e.id} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{e.name}</Text>
                <Text style={styles.entryMeta}>
                  {r1(e.servings)} × {e.serving} · {Math.round(e.cal * e.servings)} cal · {r1(e.p * e.servings)}P {r1(e.c * e.servings)}C {r1(e.f * e.servings)}F
                </Text>
              </View>
              <Pressable style={styles.step} onPress={() => change(e.id, -1)}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Pressable style={styles.step} onPress={() => change(e.id, 1)}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>ADD FOOD</Text>

          <Pressable style={styles.scanBtn} onPress={openScan}>
            <Text style={styles.scanBtnText}>📷  SCAN BARCODE</Text>
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder="Search foods (chicken, rice, banana...)"
            placeholderTextColor="#5f5f6a"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={searchOnline}
          />
          <Pressable style={styles.onlineBtn} onPress={searchOnline}>
            <Text style={styles.onlineBtnText}>🔎  SEARCH ONLINE DATABASE</Text>
          </Pressable>

          {results.length === 0 && <Text style={styles.empty}>No match in the quick list. Try Search online.</Text>}
          {results.map((f) => (
            <Pressable key={f.name + f.serving} style={styles.entry} onPress={() => addFood(f)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{f.name}</Text>
                <Text style={styles.entryMeta}>
                  {f.serving} · {f.cal} cal · {f.p}P {f.c}C {f.f}F
                </Text>
              </View>
              <View style={styles.add}>
                <Text style={styles.addText}>ADD</Text>
              </View>
            </Pressable>
          ))}

          {(onlineBusy || online.length > 0 || onlineMsg !== '') && (
            <Text style={[styles.cardTitle, { marginTop: 18 }]}>ONLINE RESULTS</Text>
          )}
          {onlineBusy && <ActivityIndicator color="#ff4d2e" style={{ marginVertical: 12 }} />}
          {onlineMsg !== '' && <Text style={styles.empty}>{onlineMsg}</Text>}
          {online.map((f, i) => (
            <Pressable key={f.name + f.serving + i} style={styles.entry} onPress={() => addFood(f)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryName}>{f.name}</Text>
                <Text style={styles.entryMeta}>
                  {f.serving} · {f.cal} cal · {f.p}P {f.c}C {f.f}F
                </Text>
              </View>
              <View style={styles.add}>
                <Text style={styles.addText}>ADD</Text>
              </View>
            </Pressable>
          ))}

          <Text style={styles.fine}>Quick-list values are approximate. Online and barcode data comes from Open Food Facts and can be incomplete, so check labels for exact numbers.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>CUSTOM FOOD</Text>
          <TextInput
            style={styles.input}
            placeholder="Food name"
            placeholderTextColor="#5f5f6a"
            value={cName}
            onChangeText={setCName}
          />
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Cal</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={cCal} onChangeText={setCCal} />
            </View>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Protein</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={cP} onChangeText={setCP} />
            </View>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Carbs</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={cC} onChangeText={setCC} />
            </View>
            <View style={styles.col}>
              <Text style={styles.miniLabel}>Fat</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={cF} onChangeText={setCF} />
            </View>
          </View>
          <Pressable style={styles.cta} onPress={addCustom}>
            <Text style={styles.ctaText}>ADD CUSTOM FOOD</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <View style={styles.scanWrap}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={scanned ? undefined : onScan}
          />
          <View style={styles.scanOverlay}>
            <Text style={styles.scanMsg}>{scanMsg}</Text>
            {scanned && (
              <Pressable
                style={styles.scanAgain}
                onPress={() => {
                  setScanned(false);
                  setScanMsg('Point the camera at a barcode');
                }}
              >
                <Text style={styles.ctaText}>SCAN AGAIN</Text>
              </Pressable>
            )}
            <Pressable style={styles.scanClose} onPress={() => setScanOpen(false)}>
              <Text style={styles.ctaText}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  pad: { padding: 18, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 2, marginBottom: 14 },
  card: { backgroundColor: '#0f0f14', borderColor: '#1c1c24', borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  cardTitle: { color: '#ff4d2e', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  bigNum: { color: '#fff', fontSize: 34, fontWeight: '900' },
  bigUnit: { color: '#8a8a96', fontSize: 15, fontWeight: '700' },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barLabel: { color: '#cfcfd6', fontSize: 13, fontWeight: '800' },
  barValue: { color: '#8a8a96', fontSize: 13, fontWeight: '700' },
  barTrack: { height: 10, borderRadius: 6, backgroundColor: '#1c1c24', overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 6 },
  link: { color: '#ffb02e', fontSize: 13, fontWeight: '800', marginTop: 16 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  col: { flex: 1 },
  miniLabel: { color: '#8a8a96', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#262630',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  empty: { color: '#6b6b76', fontSize: 14, marginVertical: 8 },
  entry: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopColor: '#1c1c24', borderTopWidth: 1, gap: 8 },
  entryName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  entryMeta: { color: '#8a8a96', fontSize: 12, fontWeight: '600', marginTop: 2 },
  step: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1c1c24', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  add: { backgroundColor: '#ff4d2e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  cta: { backgroundColor: '#ff4d2e', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  scanBtn: { backgroundColor: '#ffb02e', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  scanBtnText: { color: '#050507', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  onlineBtn: { backgroundColor: '#1c1c24', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8, borderColor: '#262630', borderWidth: 1 },
  onlineBtnText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  fine: { color: '#5f5f6a', fontSize: 12, marginTop: 10, lineHeight: 17 },
  lockCard: { backgroundColor: '#0f0f14', borderColor: '#ff4d2e', borderWidth: 1, borderRadius: 20, padding: 20 },
  lockBadge: { color: '#050507', backgroundColor: '#ffb02e', alignSelf: 'flex-start', fontWeight: '900', fontSize: 12, letterSpacing: 2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  lockTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 14 },
  lockText: { color: '#a8a8b3', fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 10 },
  lockPoint: { color: '#e6e6ec', fontSize: 14, fontWeight: '700', marginTop: 6 },
  scanWrap: { flex: 1, backgroundColor: '#000' },
  scanOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingBottom: 40, backgroundColor: 'rgba(5,5,7,0.85)' },
  scanMsg: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  scanAgain: { backgroundColor: '#ff4d2e', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  scanClose: { backgroundColor: '#1c1c24', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
});