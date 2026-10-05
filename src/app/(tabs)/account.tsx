import type { Session } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type Profile = { id: string; username: string; avatar_url: string | null };

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

export default function AccountScreen() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let alive = true;
    if (!session) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setProfile(data ?? null);
        if (data) setUsername(data.username);
        setLoadingProfile(false);
      });
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!r.canceled && r.assets?.[0]?.uri) setPhoto(r.assets[0].uri);
  };

  const signUp = async () => {
    setMsg('');
    if (!email.includes('@') || password.length < 6) {
      setMsg('Enter a valid email and a password with at least 6 characters.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (!data.session) setMsg('Check your email to confirm your account, then log in.');
  };

  const logIn = async () => {
    setMsg('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg(error.message);
  };

  const uploadAvatar = async (userId: string, uri: string) => {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    const path = `${userId}/avatar-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('avatars').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  };

  const saveProfile = async () => {
    if (!session) return;
    const name = username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
      setMsg('Username must be 3-20 letters, numbers or underscores.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      let url: string | null = profile?.avatar_url ?? null;
      if (photo) url = await uploadAvatar(session.user.id, photo);
      const { error } = await supabase.from('profiles').upsert({ id: session.user.id, username: name, avatar_url: url });
      if (error) {
        setMsg(error.code === '23505' ? 'That username is taken. Try another.' : error.message);
      } else {
        setProfile({ id: session.user.id, username: name, avatar_url: url });
        setPhoto(null);
        setEditing(false);
      }
    } catch (e: any) {
      setMsg(e?.message ?? 'Something went wrong.');
    }
    setBusy(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setMsg('');
  };

  const deleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your profile, lifts and photos. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!session) return;
            setBusy(true);
            try {
              const uid = session.user.id;
              for (const bucket of ['avatars', 'proofs']) {
                const { data } = await supabase.storage.from(bucket).list(uid);
                if (data && data.length > 0) {
                  await supabase.storage.from(bucket).remove(data.map((f) => `${uid}/${f.name}`));
                }
              }
              const { error } = await supabase.rpc('delete_my_account');
              if (error) throw error;
              try {
                await supabase.auth.signOut({ scope: 'local' });
              } catch {}
              setProfile(null);
              setSession(null);
            } catch (e: any) {
              Alert.alert('Could not delete account', e?.message ?? 'Please try again.');
            }
            setBusy(false);
          },
        },
      ]
    );
  };

  if (!ready || loadingProfile) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color="#ff4d2e" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  // SIGNED OUT
  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>JOIN BENCHRISE</Text>
          <Text style={styles.sub}>Create an account to post lifts and climb the leaderboard.</Text>
          <View style={styles.card}>
            <View style={styles.toggle}>
              <Pressable style={[styles.toggleBtn, mode === 'signup' && styles.toggleOn]} onPress={() => setMode('signup')}>
                <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextOn]}>SIGN UP</Text>
              </Pressable>
              <Pressable style={[styles.toggleBtn, mode === 'login' && styles.toggleOn]} onPress={() => setMode('login')}>
                <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextOn]}>LOG IN</Text>
              </Pressable>
            </View>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor="#5f5f6a"
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor="#5f5f6a"
            />
            {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
            <Pressable style={styles.cta} onPress={mode === 'signup' ? signUp : logIn} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{mode === 'signup' ? 'CREATE ACCOUNT' : 'LOG IN'}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // SIGNED IN, NEEDS PROFILE (or editing)
  if (!profile || editing) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{profile ? 'EDIT PROFILE' : 'CREATE YOUR PROFILE'}</Text>
          <Text style={styles.sub}>Pick a username and a profile picture. Both show on the leaderboard.</Text>
          <View style={styles.card}>
            <Pressable onPress={pickPhoto} style={{ alignItems: 'center', marginBottom: 14 }}>
              <Avatar uri={photo ?? profile?.avatar_url} name={username} size={96} />
              <Text style={styles.link}>{photo || profile?.avatar_url ? 'Change photo' : 'Add a photo'}</Text>
            </Pressable>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              placeholder="e.g. heavybencher"
              placeholderTextColor="#5f5f6a"
              maxLength={20}
            />
            {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
            <Pressable style={styles.cta} onPress={saveProfile} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>SAVE PROFILE</Text>}
            </Pressable>
            {profile && (
              <Pressable style={styles.ghost} onPress={() => { setEditing(false); setPhoto(null); setMsg(''); }}>
                <Text style={styles.ghostText}>CANCEL</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // SIGNED IN WITH PROFILE
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.title}>ME</Text>
        <View style={[styles.card, { alignItems: 'center' }]}>
          <Avatar uri={profile.avatar_url} name={profile.username} size={96} />
          <Text style={styles.name}>@{profile.username}</Text>
          <Text style={styles.email}>{session.user.email}</Text>
          <Pressable style={styles.ghost} onPress={() => { setEditing(true); setMsg(''); }}>
            <Text style={styles.ghostText}>EDIT PROFILE</Text>
          </Pressable>
        </View>
        <View style={styles.card}>
          <Pressable style={styles.ghost} onPress={signOut}>
            <Text style={styles.ghostText}>LOG OUT</Text>
          </Pressable>
          <Pressable style={styles.danger} onPress={deleteAccount} disabled={busy}>
            {busy ? <ActivityIndicator color="#ff6b6b" /> : <Text style={styles.dangerText}>DELETE MY ACCOUNT</Text>}
          </Pressable>
          <Text style={styles.fine}>Deleting your account permanently removes your profile, lifts and photos.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050507' },
  pad: { padding: 18, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: 2, marginBottom: 6 },
  sub: { color: '#8a8a96', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  card: { backgroundColor: '#0f0f14', borderColor: '#1c1c24', borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  label: { color: '#8a8a96', fontSize: 11, fontWeight: '800', marginBottom: 4, marginTop: 8, letterSpacing: 1 },
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
  msg: { color: '#ff6b6b', fontSize: 13, fontWeight: '700', marginTop: 10 },
  cta: { backgroundColor: '#ff4d2e', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  ghost: { backgroundColor: '#1c1c24', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12, alignSelf: 'stretch' },
  ghostText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  danger: { borderColor: '#ff6b6b', borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  dangerText: { color: '#ff6b6b', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  fine: { color: '#5f5f6a', fontSize: 12, marginTop: 12, lineHeight: 17 },
  toggle: { flexDirection: 'row', backgroundColor: '#17171d', borderRadius: 12, padding: 4, marginBottom: 6 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  toggleOn: { backgroundColor: '#ff4d2e' },
  toggleText: { color: '#8a8a96', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  toggleTextOn: { color: '#fff' },
  link: { color: '#ffb02e', fontSize: 13, fontWeight: '800', marginTop: 8 },
  name: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 12 },
  email: { color: '#8a8a96', fontSize: 13, marginTop: 4 },
});