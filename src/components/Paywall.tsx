import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { buy, getPackages, Packages, restore } from '../lib/purchases';

// TODO: replace these with your real hosted pages before submitting to Apple.
const TERMS_URL = 'https://example.com/terms';
const PRIVACY_URL = 'https://example.com/privacy';

const DEFAULT_PERKS = ['Every week of your full program', 'Auto deloads and test week attempts', 'All technique lessons', 'Food tracker with barcode scan'];

type Props = { title?: string; perks?: string[] };

export default function Paywall({ title = 'Unlock your full program', perks = DEFAULT_PERKS }: Props) {
  const [pkgs, setPkgs] = useState<Packages>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState<'annual' | 'monthly'>('annual');

  const load = async () => {
    setLoading(true);
    setPkgs(await getPackages());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const { monthly, annual } = pkgs;
  const selected = billing === 'annual' ? annual ?? monthly : monthly ?? annual;
  const selectedIsAnnual = !!selected && selected === annual;

  let savePct = 0;
  if (monthly && annual) {
    savePct = Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100);
  }

  const onBuy = async () => {
    if (!selected || busy) return;
    setBusy(true);
    const result = await buy(selected);
    setBusy(false);
    if (result === 'error') {
      Alert.alert('Purchase failed', 'Something went wrong and you were not charged. Please try again.');
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    const result = await restore();
    setBusy(false);
    if (result === 'active') Alert.alert('Restored', 'Your Pro access is back.');
    else if (result === 'none') Alert.alert('Nothing to restore', 'We could not find an active subscription on this Apple ID.');
    else Alert.alert('Could not restore', 'Check your connection and try again.');
  };

  return (
    <View style={styles.paywall}>
      <Text style={styles.proTag}>BENCHRISE PRO</Text>
      <Text style={styles.paywallTitle}>{title}</Text>
      {perks.map((p) => (
        <Text key={p} style={styles.perk}>+  {p}</Text>
      ))}

      {loading ? (
        <ActivityIndicator color="#ff4d2e" style={{ marginVertical: 24 }} />
      ) : !selected ? (
        <View>
          <Text style={styles.fine}>Prices could not be loaded. Check your connection and try again.</Text>
          <Pressable style={styles.ghost} onPress={load}>
            <Text style={styles.ghostText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <View style={styles.planRow}>
            {annual && (
              <Pressable style={[styles.planBox, selectedIsAnnual ? styles.planOn : null]} onPress={() => setBilling('annual')}>
                {savePct > 0 ? <Text style={styles.badge}>SAVE {savePct}%</Text> : <Text style={styles.badgeOff}> </Text>}
                <Text style={styles.planName}>Yearly</Text>
                <Text style={styles.planPrice}>{annual.product.priceString} / year</Text>
              </Pressable>
            )}
            {monthly && (
              <Pressable style={[styles.planBox, !selectedIsAnnual ? styles.planOn : null]} onPress={() => setBilling('monthly')}>
                <Text style={styles.badgeOff}> </Text>
                <Text style={styles.planName}>Monthly</Text>
                <Text style={styles.planPrice}>{monthly.product.priceString} / month</Text>
              </Pressable>
            )}
          </View>

          <Pressable style={[styles.button, busy ? styles.disabled : null]} onPress={onBuy} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                SUBSCRIBE · {selected.product.priceString} / {selectedIsAnnual ? 'YEAR' : 'MONTH'}
              </Text>
            )}
          </Pressable>

          <Text style={styles.fine}>
            BenchRise Pro is an auto-renewing subscription. {selected.product.priceString} per {selectedIsAnnual ? 'year' : 'month'} is charged to your Apple ID at confirmation. It renews automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in Settings, then your Apple ID, then Subscriptions.
          </Text>
        </View>
      )}

      <Pressable onPress={onRestore} disabled={busy} style={styles.restore}>
        <Text style={styles.link}>Restore Purchases</Text>
      </Pressable>
      <View style={styles.legalRow}>
        <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
          <Text style={styles.link}>Terms of Use</Text>
        </Pressable>
        <Text style={styles.fine}>  |  </Text>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={styles.link}>Privacy Policy</Text>
        </Pressable>
      </View>
    </View>
  );
}

const glow = { shadowColor: '#ff4d2e', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10 };

const styles = StyleSheet.create({
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
  button: { backgroundColor: '#ff4d2e', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 20, ...glow },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  ghost: { borderWidth: 1.5, borderColor: '#2c2c36', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  ghostText: { color: '#cfcfd6', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  fine: { color: '#6a6a75', fontSize: 11, lineHeight: 16, marginTop: 14 },
  restore: { alignItems: 'center', marginTop: 16 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  link: { color: '#9a9aa6', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});