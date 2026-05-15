import { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';
import { theme } from '../theme.js';

const FEE_RATE = { earnings: 0.2, referral: 0 };

/**
 * Withdraw flow — works for both creator earnings and referral
 * wallet. Source is passed via route.params.source (`'earnings'`
 * default; `'referral'` for the referral wallet).
 *
 * Form:
 *   1. UPI handle to send the money to (or phone, the backend tries
 *      to suffix it with @paytm if it's all digits).
 *   2. Amount in credits to withdraw.
 *   3. QR screenshot — required, so the admin can confirm the UPI
 *      handle in the screenshot matches the one the user typed.
 *   4. Submit → POST /wallet/withdraw, lands as `pending`.
 *
 * Earnings withdrawals deduct a 20% platform fee from the gross at
 * approval time; the form shows the net the user will actually
 * receive in their UPI account.
 */
export default function Withdraw({ route, navigation }) {
  const me = useAuthStore((s) => s.user);
  const source = route?.params?.source === 'referral' ? 'referral' : 'earnings';
  const feeRate = FEE_RATE[source] ?? 0;

  const balance = source === 'referral'
    ? (me?.referralWalletBalance || 0)
    : (me?.earningsBalance || 0);

  const [upi, setUpi] = useState('');
  const [amount, setAmount] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const grossNum = Number(amount);
  const showFee = useMemo(
    () => feeRate > 0 && Number.isFinite(grossNum) && grossNum > 0,
    [feeRate, grossNum],
  );
  const fee = showFee ? Math.round(grossNum * feeRate * 100) / 100 : 0;
  const net = showFee ? Math.round((grossNum - fee) * 100) / 100 : grossNum;

  const pickScreenshot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach a QR screenshot.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]) setScreenshot(res.assets[0]);
  };

  const submit = async () => {
    setError(null);
    const u = upi.trim();
    const num = Number(amount);
    if (!u) return setError('Enter the UPI id / phone to receive the payout.');
    if (!Number.isFinite(num) || num < 1) return setError('Enter at least 1 credit to withdraw.');
    if (num > balance) return setError(`You only have ₹${fmtCredits(balance)} available in this wallet.`);
    if (!screenshot?.uri) return setError('Please attach a QR screenshot — admin verifies it before paying out.');

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', {
        uri: screenshot.uri,
        name: 'withdraw-qr.jpg',
        type: screenshot.mimeType || 'image/jpeg',
      });
      const url =
        `${api.defaults.baseURL}/wallet/withdraw` +
        `?amount=${encodeURIComponent(num)}` +
        `&upiId=${encodeURIComponent(u)}` +
        `&source=${encodeURIComponent(source)}`;
      const token = useAuthStore.getState().accessToken;
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fd,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error?.message || 'Upload failed');
      setDone({ net, fee, gross: num });
    } catch (e) {
      setError(e.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.done}>
          <View style={styles.doneIcon}>
            <Feather name="check" size={28} color="#fff" strokeWidth={3} />
          </View>
          <Text style={styles.doneTitle}>Withdrawal requested</Text>
          <Text style={styles.doneBody}>
            We&rsquo;ll send ₹{fmtCredits(done.net)} to{' '}
            <Text style={styles.bonusInline}>{upi}</Text>{' '}
            after admin review.
            {done.fee > 0 ? (
              <Text> Platform fee of ₹{fmtCredits(done.fee)} (20%) applied.</Text>
            ) : null}
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.cta, { backgroundColor: theme.colors.tinder, marginTop: 20 }]}
          >
            <Text style={styles.ctaText}>Back to Billing</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={6}>
          <Feather name="arrow-left" size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            Withdraw {source === 'referral' ? 'referral' : 'earnings'}
          </Text>
          <Text style={styles.subtitle}>
            Available: ₹{fmtCredits(balance)} credits
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          <View style={styles.formCard}>
            <Field label="UPI id (or phone number)">
              <TextInput
                value={upi}
                onChangeText={setUpi}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="yourname@paytm or 99999XXXXX"
                placeholderTextColor={theme.colors.mutedSoft}
                style={styles.input}
              />
            </Field>

            <Field label="Amount (credits)">
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={theme.colors.mutedSoft}
                style={styles.input}
              />
              {grossNum > 0 && (
                <Pressable onPress={() => setAmount(String(balance))}>
                  <Text style={styles.maxHint}>Tap to use full balance · ₹{fmtCredits(balance)}</Text>
                </Pressable>
              )}
            </Field>

            <Field label="UPI QR screenshot">
              <Pressable onPress={pickScreenshot} style={styles.uploadRow}>
                <Feather name={screenshot ? 'check' : 'upload'} size={14} color={theme.colors.brand700} />
                <Text style={styles.uploadText} numberOfLines={1}>
                  {screenshot ? 'Replace QR' : 'Attach UPI QR'}
                </Text>
              </Pressable>
              {screenshot && (
                <View style={styles.screenshotPreview}>
                  <Image source={{ uri: screenshot.uri }} style={styles.screenshotImg} resizeMode="cover" />
                  <Pressable
                    onPress={() => setScreenshot(null)}
                    style={styles.screenshotRemove}
                    hitSlop={6}
                  >
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
                </View>
              )}
            </Field>

            {showFee && grossNum > 0 && (
              <View style={styles.feeCard}>
                <FeeRow label={`Withdrawing ₹${fmtCredits(grossNum)}`} />
                <FeeRow label={`Platform fee (${Math.round(feeRate * 100)}%)`} amount={`−₹${fmtCredits(fee)}`} />
                <View style={styles.feeDivider} />
                <FeeRow label="You'll receive" amount={`₹${fmtCredits(net)}`} strong />
              </View>
            )}

            {source === 'referral' && grossNum > 0 && (
              <Text style={styles.feeNote}>
                Referral wallet pays out at full value — no platform fee on these.
              </Text>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={submit}
              disabled={submitting}
              style={[styles.cta, { backgroundColor: '#f59e0b' }, submitting && { opacity: 0.6 }]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="download" size={16} color="#fff" />
                  <Text style={styles.ctaText}>Submit withdrawal</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.note}>
              Admin verifies the UPI handle against the screenshot before paying
              out (usually under 24 hours). If something looks off we&rsquo;ll
              flag the request and contact you.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function FeeRow({ label, amount, strong = false }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={[strong && { fontWeight: '800', color: theme.colors.ink }, !strong && { color: theme.colors.muted }, { fontSize: 13 }]}>
        {label}
      </Text>
      {amount ? (
        <Text style={[strong ? { fontWeight: '800', color: theme.colors.ink, fontSize: 14 } : { color: theme.colors.ink, fontSize: 13 }]}>
          {amount}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.ink },
  subtitle: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },

  formCard: {
    padding: 14,
    borderRadius: theme.radius.xl,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.ink, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, color: theme.colors.ink, backgroundColor: '#fff',
  },
  maxHint: { color: theme.colors.brand600, fontSize: 11, marginTop: 6, fontWeight: '700' },

  uploadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: theme.colors.brand50,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.brand200,
  },
  uploadText: { color: theme.colors.brand700, fontWeight: '700', flex: 1 },
  screenshotPreview: {
    marginTop: 10, position: 'relative',
    borderRadius: theme.radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  screenshotImg: { width: '100%', aspectRatio: 4 / 3 },
  screenshotRemove: {
    position: 'absolute', top: 6, right: 6,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },

  feeCard: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#fffbeb',
    borderRadius: theme.radius.md,
    borderColor: '#fde68a', borderWidth: 1,
  },
  feeDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#fde68a', marginVertical: 4 },
  feeNote: {
    marginTop: 10, color: '#047857', fontSize: 12,
    backgroundColor: '#ecfdf5', padding: 10, borderRadius: theme.radius.md,
  },

  error: { color: theme.colors.danger, fontSize: 13, marginTop: 10 },
  cta: {
    marginTop: 16, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: theme.radius.pill,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  note: { color: theme.colors.muted, fontSize: 11, marginTop: 12, lineHeight: 16 },

  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  doneIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#16a34a',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  doneTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.ink },
  doneBody: { fontSize: 14, color: theme.colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 20, maxWidth: 320 },
  bonusInline: { color: theme.colors.ink, fontWeight: '700' },
});
