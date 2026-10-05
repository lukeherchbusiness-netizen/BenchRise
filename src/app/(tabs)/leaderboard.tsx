import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Unit, fmt, loadUnit, toDisplay, toLb } from '../../lib/units';

type Division = 'Raw' | 'Wraps';
type SortBy = 'lbs' | 'pct';
type Filter = 'All' | Division;
type Proof = { uri: string; type: 'image' | 'video' };
type Profile = { username: string; avatar?: string };
// Weights are stored in pounds and converted for display
type Entry = {
  id: string;
  username: string;
  avatar?: string;
  start: number;
  pr: number;
  division: Division;
  verified: boolean;
  proof?: Proof;
};

// SAMPLE DATA ONLY. Replace with real data from a backend later.
const SAMPLE: Entry[] = [
  { id: 's1', username: 'marcus_lifts', start: 205, pr: 275, division: 'Raw', verified: true },
  { id: 's2', username: 'jenna.r', start: 95, pr: 145, division: 'Raw', verified: true },
  { id: 's3', username: 'dre_press', start: 245, pr: 305, division: 'Wraps', verified: true },
  { id: 's4', username: 'samk', start: 155, pr: 205, division: 'Raw', verified: true },
  { id: 's5', username: 'luisbench', start: 185, pr: 225, division: 'Raw', verified: true },
  { id: 's6', username: 'priya_n', start: 85, pr: 115, division: 'Wraps', verified: true },
];

const gain = (e: Entry) => e.pr - e.start;
const pctGain = (e: Entry) => ((e.pr - e.start) / e.start) * 100;
const RANK_COLOR = ['#ffb02e', '#c0c0cc', '#c98a5a'];
const AVATAR_COLORS = ['#ff4d2e', '#4da3ff', '#3ddc97', '#ffb02e', '#b57bff', '#ff6ba8'];

function Avatar({ name, uri, size }: { name: string; uri?: string; size: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: AVATAR_COLORS[h % AVATAR_COLORS.length],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#050507', fontWeight: '900', fontSize: size * 0.42 }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, on ? styles.chipOn : null]} onPress={onPress}>
      <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{label}</Text>
    </Pressable>
  );
}

export default function Leaderboard() {
  const router = useRouter();
  const [unit, setUnit] = useState<Unit>('lb');
  const [entries, setEntries] = useState<Entry[]>(SAMPLE);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('lbs');
  const [filter, setFilter] = useState<Filter>('All');
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [start, setStart] = useState('');
  const [pr, setPr] = useState('');
  const [division, setDivision] = useState<Division>('Raw');
  const [proof, setProof] = useState<Proof | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUnit().then(setUnit);
  }, []);

  const ranked = useMemo(() => {
    const list = entries.filter((e) => filter === 'All' || e.division === filter);
    return [...list].sort((a, b) => (sortBy === 'lbs' ? gain(b) - gain(a) : pctGain(b) - pctGain(a)));
  }, [entries, sortBy, filter]);

  const openForm = () => {
    if (profile) {
      setUsername(profile.username);
      setAvatar(profile.avatar);
    }
    setShowForm(true);
  };

  const askPermission = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Allow photo access in your iPhone Settings to attach photos.');
      return false;
    }
    return true;
  };

  const pickAvatar = async () => {
    if (!(await askPermission())) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!res.canceled && res.assets.length > 0) {
      setAvatar(res.assets[0].uri);
      setError('');
    }
  };

  const pickProof = async () => {
    if (!(await askPermission())) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
    });
    if (!res.canceled && res.assets.length > 0) {
      const a = res.assets[0];
      setProof({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image' });
      setError('');
    }
  };

  const submit = () => {
    const handle = username.trim().toLowerCase();
    const s = toLb(parseFloat(start), unit);
    const p = toLb(parseFloat(pr), unit);
    if (!/^[a-z0-9_.]{3,20}$/.test(handle)) {
      setError('Username must be 3 to 20 characters: letters, numbers, dots, or underscores.');
      return;
    }
    const taken = entries.some((e) => e.username === handle && (!profile || profile.username !== handle));
    if (taken) {
      setError('That username is taken. Try another.');
      return;
    }
    if (!(s > 0) || !(p > 0)) {
      setError('Enter both your starting max and your new PR.');
      return;
    }
    if (p <= s) {
      setError('Your new PR has to be higher than your starting max.');
      return;
    }
    if (!proof) {
      setError('Attach a photo or video of the lift as proof.');
      return;
    }
    setEntries([
      ...entries,
      { id: String(Date.now()), username: handle, avatar, start: s, pr: p, division, verified: false, proof },
    ]);
    setProfile({ username: handle, avatar });
    setStart('');
    setPr('');
    setProof(null);
    setError('');
    setShowForm(false);
  };

  const gainText = (e: Entry) =>
    sortBy === 'lbs' ? String(Math.round(toDisplay(gain(e), unit) * 10) / 10) : pctGain(e).toFixed(1);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>{'<  Back'}</Text>
        </Pressable>

        <Text style={styles.tag}>BENCHRISE</Text>
        <Text style={styles.title}>LEADERBOARD</Text>
        <Text style={styles.sub}>Ranked by who added the most weight to their bench. Every PR needs photo or video proof.</Text>

        <View style={styles.demo}>
          <Text style={styles.demoText}>Demo mode: these are sample lifters, and your submissions stay on this phone until the online version is built.</Text>
        </View>

        <Text style={styles.label}>RANK BY</Text>
        <View style={styles.chipRow}>
          <Chip label={`Most ${unit} gained`} on={sortBy === 'lbs'} onPress={() => setSortBy('lbs')} />
          <Chip label="Most % gained" on={sortBy === 'pct'} onPress={() => setSortBy('pct')} />
        </View>

        <Text style={styles.label}>DIVISION</Text>
        <View style={styles.chipRow}>
          {(['All', 'Raw', 'Wraps'] as Filter[]).map((f) => (
            <Chip key={f} label={f} on={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>

        <View style={{ marginTop: 18 }}>
          {ranked.map((e, i) => (
            <View key={e.id} style={[styles.row, i === 0 ? styles.rowFirst : null]}>
              <Text style={[styles.rank, { color: RANK_COLOR[i] ?? '#6a6a75' }]}>{i + 1}</Text>
              <View style={styles.avatarWrap}>
                <Avatar name={e.username} uri={e.avatar} size={44} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>@{e.username}</Text>
                <Text style={styles.meta}>
                  {e.division}  |  {fmt(e.start, unit)} {'>'} {fmt(e.pr, unit)} {unit}
                </Text>
                <Text style={e.verified ? styles.badgeOk : styles.badgePending}>
                  {e.verified ? 'VERIFIED' : 'PENDING REVIEW'}
                </Text>
              </View>
              {e.proof && e.proof.type === 'image' && (
                <Image source={{ uri: e.proof.uri }} style={styles.thumb} />
              )}
              {e.proof && e.proof.type === 'video' && (
                <View style={[styles.thumb, styles.thumbVideo]}>
                  <Text style={styles.thumbVideoText}>VIDEO</Text>
                </View>
              )}
              <View style={styles.gainBox}>
                <Text style={styles.gain}>+{gainText(e)}</Text>
                <Text style={styles.gainUnit}>{sortBy === 'lbs' ? unit : '%'}</Text>
              </View>
            </View>
          ))}
        </View>

        {!showForm ? (
          <Pressable style={styles.button} onPress={openForm}>
            <Text style={styles.buttonText}>SUBMIT A PR</Text>
          </Pressable>
        ) : (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Submit a PR</Text>

            <View style={styles.profileRow}>
              <Pressable onPress={pickAvatar}>
                <Avatar name={username.trim() || '?'} uri={avatar} size={72} />
              </Pressable>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.labelTight}>USERNAME</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="your_username"
                  placeholderTextColor="#444450"
                />
                <Pressable onPress={pickAvatar}>
                  <Text style={styles.link}>{avatar ? 'Change profile picture' : 'Add profile picture'}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>STARTING MAX ({unit.toUpperCase()})</Text>
                <TextInput style={styles.input} value={start} onChangeText={setStart} keyboardType="decimal-pad" placeholder={unit === 'kg' ? '100' : '225'} placeholderTextColor="#444450" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>NEW PR ({unit.toUpperCase()})</Text>
                <TextInput style={styles.input} value={pr} onChangeText={setPr} keyboardType="decimal-pad" placeholder={unit === 'kg' ? '110' : '245'} placeholderTextColor="#444450" />
              </View>
            </View>

            <Text style={styles.label}>DIVISION</Text>
            <View style={styles.chipRow}>
              <Chip label="Raw" on={division === 'Raw'} onPress={() => setDivision('Raw')} />
              <Chip label="Wraps" on={division === 'Wraps'} onPress={() => setDivision('Wraps')} />
            </View>

            <Pressable style={styles.proofBtn} onPress={pickProof}>
              <Text style={styles.proofText}>
                {proof ? (proof.type === 'video' ? 'Video attached. Tap to change' : 'Photo attached. Tap to change') : 'Attach photo or video proof'}
              </Text>
            </Pressable>
            {proof && proof.type === 'image' && <Image source={{ uri: proof.uri }} style={styles.preview} />}

            {error !== '' && <Text style={styles.error}>{error}</Text>}

            <Pressable style={styles.button} onPress={submit}>
              <Text style={styles.buttonText}>POST MY LIFT</Text>
            </Pressable>
            <Pressable onPress={() => { setShowForm(false); setError(''); }}>
              <Text style={[styles.backText, { textAlign: 'center', marginTop: 16 }]}>Cancel</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.fine}>
          In the live version, a lift only counts after it is reviewed. The video should show the full lift, the plates, and the bar being racked. Wrapped lifts rank in their own division. Only your username and profile picture are shown publicly, never your real name or email.
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
  title: { color: '#fff', fontSize: 46, fontWeight: '900', letterSpacing: -1, marginTop: 6 },
  sub: { color: '#9a9aa6', fontSize: 15, lineHeight: 22, marginTop: 8 },
  demo: { backgroundColor: '#17140d', borderRadius: 12, borderWidth: 1, borderColor: '#352d1a', padding: 12, marginTop: 16 },
  demoText: { color: '#e5d6a8', fontSize: 13, lineHeight: 18 },
  label: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 18, marginBottom: 8 },
  labelTight: { color: '#7d7d89', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#1e1e27', backgroundColor: '#0d0d12', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: '#ff4d2e', backgroundColor: '#24120d' },
  chipText: { color: '#8c8c98', fontSize: 14, fontWeight: '800' },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d12', borderRadius: 16, borderWidth: 1, borderColor: '#1e1e27', padding: 12, marginBottom: 10 },
  rowFirst: { borderColor: '#ffb02e', backgroundColor: '#17130a' },
  rank: { width: 28, fontSize: 24, fontWeight: '900' },
  avatarWrap: { marginRight: 12 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800' },
  badgeOk: { color: '#3ddc97', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 3 },
  badgePending: { color: '#ffb02e', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 3 },
  meta: { color: '#8c8c98', fontSize: 12, fontWeight: '600', marginTop: 2 },
  thumb: { width: 34, height: 34, borderRadius: 8, marginHorizontal: 8 },
  thumbVideo: { backgroundColor: '#1e1e27', alignItems: 'center', justifyContent: 'center' },
  thumbVideoText: { color: '#cfcfd6', fontSize: 8, fontWeight: '900' },
  gainBox: { alignItems: 'flex-end', minWidth: 56 },
  gain: { color: '#ff4d2e', fontSize: 24, fontWeight: '900' },
  gainUnit: { color: '#8c8c98', fontSize: 12, fontWeight: '800', marginTop: -2 },
  button: { backgroundColor: '#ff4d2e', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 20, ...glow },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  form: { backgroundColor: '#0d0d12', borderRadius: 20, borderWidth: 1.5, borderColor: '#ff4d2e', padding: 20, marginTop: 20 },
  formTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  link: { color: '#ff8a70', fontSize: 13, fontWeight: '800', marginTop: 8 },
  input: { backgroundColor: '#101016', color: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a34', paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700' },
  twoCol: { flexDirection: 'row', gap: 10 },
  proofBtn: { borderWidth: 1.5, borderColor: '#2a2a34', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  proofText: { color: '#cfcfd6', fontSize: 15, fontWeight: '800' },
  preview: { width: '100%', height: 180, borderRadius: 12, marginTop: 12 },
  error: { color: '#ff6b6b', fontSize: 14, fontWeight: '700', marginTop: 14 },
  fine: { color: '#5f5f6a', fontSize: 12, lineHeight: 17, marginTop: 22 },
});