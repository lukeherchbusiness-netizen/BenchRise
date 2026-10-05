import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Unit, fmt, loadUnit, toLb } from '../../lib/units';

type Row = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  division: string;
  start_lb: number;
  best_lb: number;
  gain_lb: number;
  gain_pct: number;
};

type Lift = {
  id: string;
  user_id: string;
  weight_lb: number;
  reps: number;
  division: string;
  proof_url: string | null;
  created_at: string;
};

const isVideoUrl = (url: string) => /\.(mp4|mov)$/i.test(url);

function Avatar({ uri, name, size }: { uri?: string | null; name?: string; size: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1c1c24' }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1c1c24', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#ff4d2e', fontSize: size / 2.4, fontWeight: '900' }}>{(name || '?').slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const rankColor = (i: number) => (i === 0 ? '#ffb02e' : i === 1 ? '#c9cdd6' : i === 2 ? '#d98a54' : '#5f5f6a');

export default function LeaderboardScreen() {
  const router = useRouter();
  const [unit, setUnit] = useState<Unit>('lb');
  const [uid, setUid] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [division, setDivision] = useState<'raw' | 'wraps'>('raw');
  const [sortBy, setSortBy] = useState<'lbs' | 'pct'>('lbs');
  const [rows, setRows] = useState<Row[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // post-a-lift form
  const [composer, setComposer] = useState(false);
  const [wStr, setWStr] = useState('');
  const [rStr, setRStr] = useState('1');
  const [cDiv, setCDiv] = useState<'raw' | 'wraps'>('raw');
  const [proof, setProof] = useState<{ uri: string; video: boolean; mime: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState('');

  // lifter detail
  const [detail, setDetail] = useState<Row | null>(null);
  const [lifts, setLifts] = useState<Lift[]>([]);
  const [liftsLoading, setLiftsLoading] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const { data: s } = await supabase.auth.getSession();
    const me = s.session?.user.id ?? null;
    setUid(me);
    let prof = false;
    let blockedIds: string[] = [];
    if (me) {
      const p = await supabase.from('profiles').select('id').eq('id', me).maybeSingle();
      prof = !!p.data;
      const b = await supabase.from('blocks').select('blocked_id').eq('blocker_id', me);
      blockedIds = (b.data ?? []).map((x: any) => x.blocked_id as string);
    }
    setHasProfile(prof);
    setBlocked(blockedIds);

    const { data, error: err } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('division', division)
      .order(sortBy === 'lbs' ? 'gain_lb' : 'gain_pct', { ascending: false })
      .limit(100);
    if (err) setError(err.message);
    else
      setRows(
        (data ?? []).map((r: any) => ({
          ...r,
          start_lb: Number(r.start_lb),
          best_lb: Number(r.best_lb),
          gain_lb: Number(r.gain_lb),
          gain_pct: Number(r.gain_pct),
        })) as Row[]
      );
  }, [division, sortBy]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setUnit(await loadUnit());
        setLoading(true);
        await load();
        if (alive) setLoading(false);
      })();
      return () => {
        alive = false;
      };
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = rows.filter((r) => !blocked.includes(r.user_id));

  const startPost = () => {
    if (!uid || !hasProfile) {
      Alert.alert('Create an account first', 'Sign up and make a profile in the Me tab, then come back to post your lift.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go to Me', onPress: () => router.push('/account') },
      ]);
      return;
    }
    setPostMsg('');
    setComposer(true);
  };

  const pickProof = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoMaxDuration: 20,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const isVideo = a.type === 'video';
    setProof({ uri: a.uri, video: isVideo, mime: a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg') });
  };

  const postLift = async () => {
    setPostMsg('');
    if (!uid) return;
    const w = parseFloat(wStr);
    const reps = parseInt(rStr, 10);
    if (isNaN(w) || w <= 0) {
      setPostMsg('Enter the weight you lifted.');
      return;
    }
    if (isNaN(reps) || reps < 1 || reps > 30) {
      setPostMsg('Reps must be between 1 and 30.');
      return;
    }
    const lb = toLb(w, unit);
    if (lb >= 1500) {
      setPostMsg('That weight looks too high. Check the number.');
      return;
    }
    if (!proof) {
      setPostMsg('Add a photo or video as proof.');
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(proof.uri);
      const buf = await res.arrayBuffer();
      const ext = proof.video ? (proof.mime.includes('quicktime') ? 'mov' : 'mp4') : 'jpg';
      const path = `${uid}/lift-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('proofs').upload(path, buf, { contentType: proof.mime });
      if (up.error) throw up.error;
      const url = supabase.storage.from('proofs').getPublicUrl(path).data.publicUrl;
      const ins = await supabase.from('lifts').insert({
        user_id: uid,
        weight_lb: Math.round(lb * 100) / 100,
        reps,
        division: cDiv,
        proof_url: url,
      });
      if (ins.error) throw ins.error;
      setComposer(false);
      setWStr('');
      setRStr('1');
      setProof(null);
      setDivision(cDiv);
      await load();
    } catch (e: any) {
      setPostMsg(e?.message ?? 'Could not post your lift.');
    }
    setPosting(false);
  };

  const openDetail = async (row: Row) => {
    setDetail(row);
    setLifts([]);
    setLiftsLoading(true);
    const { data } = await supabase
      .from('lifts')
      .select('id, user_id, weight_lb, reps, division, proof_url, created_at')
      .eq('user_id', row.user_id)
      .eq('division', division)
      .order('created_at', { ascending: false })
      .limit(10);
    setLifts(((data ?? []) as any[]).map((l) => ({ ...l, weight_lb: Number(l.weight_lb) })) as Lift[]);
    setLiftsLoading(false);
  };

  const reportLift = (lift: Lift) => {
    const send = async (reason: string) => {
      if (!uid) {
        Alert.alert('Log in first', 'Create an account in the Me tab to report content.');
        return;
      }
      const { error: err } = await supabase
        .from('reports')
        .insert({ reporter_id: uid, lift_id: lift.id, reported_user_id: lift.user_id, reason });
      Alert.alert(err ? 'Could not send report' : 'Report sent', err ? err.message : 'Thanks. We will review it.');
    };
    Alert.alert('Report this lift', 'Why are you reporting it?', [
      { text: 'Fake or edited proof', onPress: () => send('fake_proof') },
      { text: 'Inappropriate content', onPress: () => send('inappropriate') },
      { text: 'Spam or abuse', onPress: () => send('spam') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const blockUser = (row: Row) => {
    if (!uid) {
      Alert.alert('Log in first', 'Create an account in the Me tab to block users.');
      return;
    }
    Alert.alert(`Block @${row.username}?`, 'You will no longer see their lifts.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('blocks').insert({ blocker_id: uid, blocked_id: row.user_id });
          if (err) Alert.alert('Could not block', err.message);
          else {
            setDetail(null);
            await load();
          }
        },
      },
    ]);
  };

  const deleteLift = (lift: Lift) => {
    Alert.alert('Delete this lift?', 'This removes it and its proof.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('lifts').delete().eq('id', lift.id);
          if (err) {
            Alert.alert('Could not delete', err.message);
            return;
          }
          if (lift.proof_url && lift.proof_url.includes('/proofs/')) {
            const path = lift.proof_url.split('/proofs/')[1];
            if (path) await supabase.storage.from('proofs').remove([path]);
          }
          setLifts(lifts.filter((l) => l.id !== lift.id));
          await load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff4d2e" />}
      >
        <Text style={styles.title}>LEADERBOARD</Text>
        <Text style={styles.sub}>Ranked by the biggest bench gain since each lifter's first posted lift. Proof required.</Text>

        <Pressable style={styles.cta} onPress={startPost}>
          <Text style={styles.ctaText}>POST A LIFT</Text>
        </Pressable>

        <View style={styles.toggle}>
          {(['raw', 'wraps'] as const).map((d) => (
            <Pressable key={d} style={[styles.toggleBtn, division === d && styles.toggleOn]} onPress={() => setDivision(d)}>
              <Text style={[styles.toggleText, division === d && styles.toggleTextOn]}>{d === 'raw' ? 'RAW' : 'WRAPS'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.toggle}>
          <Pressable style={[styles.toggleBtn, sortBy === 'lbs' && styles.toggleOn]} onPress={() => setSortBy('lbs')}>
            <Text style={[styles.toggleText, sortBy === 'lbs' && styles.toggleTextOn]}>{unit === 'kg' ? 'KG GAINED' : 'LBS GAINED'}</Text>
          </Pressable>
          <Pressable style={[styles.toggleBtn, sortBy === 'pct' && styles.toggleOn]} onPress={() => setSortBy('pct')}>
            <Text style={[styles.toggleText, sortBy === 'pct' && styles.toggleTextOn]}>% GAINED</Text>
          </Pressable>
        </View>

        {loading && <ActivityIndicator color="#ff4d2e" style={{ marginTop: 30 }} />}
        {error !== '' && <Text style={styles.err}>{error}</Text>}
        {!loading && error === '' && visible.length === 0 && (
          <Text style={styles.empty}>No lifts here yet. Be the first on the board.</Text>
        )}

        {visible.map((r, i) => (
          <Pressable key={r.user_id + r.division} style={styles.row} onPress={() => openDetail(r)}>
            <Text style={[styles.rank, { color: rankColor(i) }]}>{i + 1}</Text>
            <Avatar uri={r.avatar_url} name={r.username} size={44} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.rowName}>@{r.username}</Text>
              <Text style={styles.rowMeta}>
                {fmt(r.start_lb, unit)} → {fmt(r.best_lb, unit)} {unit} est. 1RM
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.gain}>
                +{fmt(r.gain_lb, unit)} {unit}
              </Text>
              <Text style={styles.pct}>+{r.gain_pct}%</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* POST A LIFT */}
      <Modal visible={composer} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setComposer(false)}>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>POST A LIFT</Text>
            <Text style={styles.sub}>Your first post sets your starting point. Post heavier lifts later to climb.</Text>
            <View style={styles.card}>
              <Text style={styles.label}>Weight ({unit})</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={wStr} onChangeText={setWStr} placeholder="e.g. 225" placeholderTextColor="#5f5f6a" />
              <Text style={styles.label}>Reps</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={rStr} onChangeText={setRStr} placeholder="1" placeholderTextColor="#5f5f6a" />
              <Text style={styles.label}>Division</Text>
              <View style={[styles.toggle, { marginTop: 4 }]}>
                {(['raw', 'wraps'] as const).map((d) => (
                  <Pressable key={d} style={[styles.toggleBtn, cDiv === d && styles.toggleOn]} onPress={() => setCDiv(d)}>
                    <Text style={[styles.toggleText, cDiv === d && styles.toggleTextOn]}>{d === 'raw' ? 'RAW' : 'WRAPS'}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.ghost} onPress={pickProof}>
                <Text style={styles.ghostText}>{proof ? 'CHANGE PROOF' : 'ADD PHOTO OR VIDEO PROOF'}</Text>
              </Pressable>
              {proof && !proof.video && <Image source={{ uri: proof.uri }} style={styles.preview} />}
              {proof && proof.video && <Text style={styles.videoNote}>Video selected (up to 20 seconds)</Text>}
              {postMsg !== '' && <Text style={styles.err}>{postMsg}</Text>}
              <Pressable style={styles.cta} onPress={postLift} disabled={posting}>
                {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>SUBMIT LIFT</Text>}
              </Pressable>
              <Pressable style={styles.ghost} onPress={() => setComposer(false)}>
                <Text style={styles.ghostText}>CANCEL</Text>
              </Pressable>
              <Text style={styles.fine}>Fake or edited proof gets removed and can get your account banned.</Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* LIFTER DETAIL */}
      <Modal visible={!!detail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetail(null)}>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.pad}>
            {detail && (
              <>
                <View style={{ alignItems: 'center', marginBottom: 14 }}>
                  <Avatar uri={detail.avatar_url} name={detail.username} size={80} />
                  <Text style={styles.detailName}>@{detail.username}</Text>
                  <Text style={styles.gain}>
                    +{fmt(detail.gain_lb, unit)} {unit} ({detail.gain_pct}%)
                  </Text>
                </View>
                {liftsLoading && <ActivityIndicator color="#ff4d2e" />}
                {lifts.map((l) => (
                  <View key={l.id} style={styles.card}>
                    <Text style={styles.rowName}>
                      {fmt(l.weight_lb, unit)} {unit} × {l.reps}
                    </Text>
                    <Text style={styles.rowMeta}>{new Date(l.created_at).toLocaleDateString()}</Text>
                    {l.proof_url && !isVideoUrl(l.proof_url) && <Image source={{ uri: l.proof_url }} style={styles.preview} />}
                    {l.proof_url && isVideoUrl(l.proof_url) && (
                      <Pressable style={styles.ghost} onPress={() => Linking.openURL(l.proof_url as string)}>
                        <Text style={styles.ghostText}>WATCH VIDEO PROOF</Text>
                      </Pressable>
                    )}
                    {l.user_id === uid ? (
                      <Pressable style={styles.danger} onPress={() => deleteLift(l)}>
                        <Text style={styles.dangerText}>DELETE MY LIFT</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={styles.ghost} onPress={() => reportLift(l)}>
                        <Text style={styles.ghostText}>REPORT THIS LIFT</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                {detail.user_id !== uid && (
                  <Pressable style={styles.danger} onPress={() => blockUser(detail)}>
                    <Text style={styles.dangerText}>BLOCK @{detail.username}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.ghost} onPress={() => setDetail(null)}>
                  <Text style={styles.ghostText}>CLOSE</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  pad: { padding: 18, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 2, marginBottom: 6 },
  sub: { color: '#8a8a96', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  card: { backgroundColor: '#0f0f14', borderColor: '#1c1c24', borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  label: { color: '#8a8a96', fontSize: 11, fontWeight: '800', marginBottom: 4, marginTop: 10, letterSpacing: 1 },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#262630',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cta: { backgroundColor: '#ff4d2e', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  ghost: { backgroundColor: '#1c1c24', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  ghostText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  danger: { borderColor: '#ff6b6b', borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  dangerText: { color: '#ff6b6b', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  toggle: { flexDirection: 'row', backgroundColor: '#17171d', borderRadius: 12, padding: 4, marginBottom: 10 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  toggleOn: { backgroundColor: '#ff4d2e' },
  toggleText: { color: '#8a8a96', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  toggleTextOn: { color: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f14',
    borderColor: '#1c1c24',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  rank: { width: 30, fontSize: 20, fontWeight: '900', textAlign: 'center', marginRight: 6 },
  rowName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  rowMeta: { color: '#8a8a96', fontSize: 12, fontWeight: '600', marginTop: 2 },
  gain: { color: '#ffb02e', fontSize: 17, fontWeight: '900' },
  pct: { color: '#8a8a96', fontSize: 12, fontWeight: '700', marginTop: 2 },
  empty: { color: '#6b6b76', fontSize: 15, textAlign: 'center', marginTop: 30 },
  err: { color: '#ff6b6b', fontSize: 13, fontWeight: '700', marginTop: 10 },
  fine: { color: '#5f5f6a', fontSize: 12, marginTop: 4, lineHeight: 17 },
  preview: { width: '100%', height: 220, borderRadius: 12, marginTop: 12, backgroundColor: '#1c1c24' },
  videoNote: { color: '#ffb02e', fontSize: 13, fontWeight: '800', marginTop: 12 },
  detailName: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 10 },
});