import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';
import { theme } from '../theme.js';

/**
 * Top-up flow — port of frontend/src/pages/Billing.jsx's
 * AddCreditsForm.
 *
 * Steps the user goes through on this screen:
 *   1) Pick a random active QR via GET /wallet/payment-qr.
 *      The image is the QR they scan in their UPI app.
 *   2) Pay the amount they want to top up to the shown UPI handle.
 *   3) Paste the bank reference id from their payment app.
 *   4) (Optional) Attach the bank-app payment screenshot.
 *   5) Submit → POST /wallet/topup. Lands as a `pending` request;
 *      an admin verifies + approves.
 *
 * First-payment bonus (+40 credits) is applied server-side on the
 * first non-rejected top-up, so no client work needed for it — the
 * response includes `bonusApplied` for the success message.
 */
export default function AddCredits({ navigation }) {
  const me = useAuthStore((s) => s.user);
  const [qr, setQr] = useState(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState(null);

  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/wallet/payment-qr')
      .then((r) => {
        if (cancelled) return;
        // Backend returns the QR fields flat: { url, upiId, label, contentType }
        // — same as the web's qrUrl / qrUpiId state extracts directly.
        setQr(r.data ? { url: r.data.url, upiId: r.data.upiId, label: r.data.label } : null);
      })
      .catch((e) => !cancelled && setQrError(e.message))
      .finally(() => !cancelled && setQrLoading(false));
    return () => { cancelled = true; };
  }, []);

  const pickScreenshot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach a screenshot.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]) {
      setScreenshot(res.assets[0]);
    }
  };

  const copyUpi = () => {
    if (!qr?.upiId) return;
    // expo-clipboard would need another native rebuild, so we cheat:
    // show the UPI id as a selectable / long-pressable alert dialog
    // that the user can copy from their OS share sheet.
    Alert.alert('UPI ID', `${qr.upiId}\n\nLong-press the text above (or tap-and-hold the UPI line on the screen) to copy.`);
  };

  // Anti-screenshot (FLAG_SECURE) blocks the in-app QR from being
  // captured, which is correct for sensitive content but inconvenient
  // for the user when they need to scan the QR from their UPI app.
  // Opening the public R2 URL in the system browser sidesteps that —
  // FLAG_SECURE only applies to our app's activity. From the browser
  // they can long-press → Save image, then upload to GPay/PhonePe.
  const downloadQr = async () => {
    if (!qr?.url) return;
    try {
      const can = await Linking.canOpenURL(qr.url);
      if (!can) {
        Alert.alert('Cannot open URL', qr.url);
        return;
      }
      await Linking.openURL(qr.url);
    } catch (e) {
      Alert.alert('Open failed', e.message || 'Could not open the QR.');
    }
  };

  const submit = async () => {
    setError(null);
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 1) {
      setError('Enter at least 1 credit.');
      return;
    }
    const ref = reference.trim();
    if (ref.length < 6 || ref.length > 64) {
      setError('Reference id should be 6–64 letters / digits.');
      return;
    }
    if (!/^[A-Za-z0-9_\-]+$/.test(ref)) {
      setError('Reference id can only contain letters, digits, dashes or underscores.');
      return;
    }

    setSubmitting(true);
    try {
      let resp;
      if (screenshot?.uri) {
        // RN multipart: the bytes go in the request body and the
        // fields go in the query string, mirroring how the web
        // posts the image. `fetch` handles file URIs natively.
        const fd = new FormData();
        fd.append('file', {
          uri: screenshot.uri,
          name: 'topup.jpg',
          type: screenshot.mimeType || 'image/jpeg',
        });
        // We can use the api wrapper but axios with file objects in
        // RN is finicky — using fetch directly is the simplest path.
        const url = `${api.defaults.baseURL}/wallet/topup?amount=${encodeURIComponent(num)}&referenceId=${encodeURIComponent(ref)}`;
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
        resp = json;
      } else {
        const r = await api.post('/wallet/topup', { amount: num, referenceId: ref });
        resp = r.data;
      }
      setDone({
        bonus: resp?.bonusApplied || 0,
        finalAmount: resp?.finalAmount ?? num,
      });
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
          <Text style={styles.doneTitle}>Request submitted</Text>
          <Text style={styles.doneBody}>
            We&rsquo;ll review your payment and credit ₹{fmtCredits(done.finalAmount)} to your
            wallet shortly.{' '}
            {done.bonus > 0 ? (
              <Text style={styles.bonusInline}>
                Includes a +{done.bonus} first-payment bonus 🎉
              </Text>
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
          <Text style={styles.title}>Add credits</Text>
          <Text style={styles.subtitle}>
            Pay via UPI → paste the reference id → submit.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          {/* Wallet snapshot */}
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Current balance</Text>
            <Text style={styles.balanceValue}>
              ₹{fmtCredits(me?.walletBalance || 0)}
            </Text>
          </View>

          {/* QR card */}
          <View style={styles.qrCard}>
            <Text style={styles.cardEyebrow}>STEP 1 · Pay via UPI</Text>
            {qrLoading ? (
              <View style={styles.qrLoading}><ActivityIndicator color={theme.colors.tinder} /></View>
            ) : qrError ? (
              <Text style={styles.error}>{qrError}</Text>
            ) : qr ? (
              <>
                <View style={styles.qrImageWrap}>
                  <Image
                    source={{ uri: qr.url }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>

                {/* Download to gallery — opens the QR image URL in the
                    system browser where the user can long-press →
                    "Save image". Necessary because FLAG_SECURE on our
                    activity blocks screenshots inside the app. */}
                <Pressable onPress={downloadQr} style={styles.downloadBtn}>
                  <Feather name="download" size={14} color={theme.colors.brand700} />
                  <Text style={styles.downloadText}>Download QR</Text>
                </Pressable>
                <Text style={styles.downloadHint}>
                  Opens in your browser — long-press the image and pick
                  &ldquo;Save&rdquo; or &ldquo;Download&rdquo; to keep it in
                  your gallery, then scan from any UPI app.
                </Text>

                {qr.upiId ? (
                  <View style={styles.upiRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.upiLabel}>UPI ID</Text>
                      <Text selectable style={styles.upiValue}>{qr.upiId}</Text>
                    </View>
                    <Pressable onPress={copyUpi} style={styles.copyBtn}>
                      <Feather name="copy" size={12} color={theme.colors.brand700} />
                      <Text style={styles.copyText}>Copy</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.muted}>No QR configured yet.</Text>
            )}
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            <Text style={styles.cardEyebrow}>STEP 2 · Confirm details</Text>

            <Field label="Amount (credits)">
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="500"
                placeholderTextColor={theme.colors.mutedSoft}
                style={styles.input}
              />
            </Field>

            <Field label="UPI reference / transaction id">
              <TextInput
                value={reference}
                onChangeText={setReference}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="From your UPI app"
                placeholderTextColor={theme.colors.mutedSoft}
                style={[styles.input, { fontFamily: 'monospace' }]}
              />
            </Field>

            <Field label="Payment screenshot (optional)">
              <Pressable onPress={pickScreenshot} style={styles.uploadRow}>
                <Feather name={screenshot ? 'check' : 'upload'} size={14} color={theme.colors.brand700} />
                <Text style={styles.uploadText} numberOfLines={1}>
                  {screenshot ? 'Replace screenshot' : 'Attach screenshot'}
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

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={submit}
              disabled={submitting}
              style={[styles.cta, { backgroundColor: theme.colors.tinder }, submitting && { opacity: 0.6 }]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={16} color="#fff" />
                  <Text style={styles.ctaText}>Submit top-up request</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.note}>
              Your request goes into a pending queue. An admin verifies the
              reference id against the platform&rsquo;s collection account and
              credits your wallet (usually under an hour during business hours).
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.ink },
  subtitle: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },

  balanceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: '#a7f3d0',
  },
  balanceLabel: { color: '#047857', fontWeight: '700', fontSize: 12 },
  balanceValue: { color: '#047857', fontWeight: '800', fontSize: 18 },

  cardEyebrow: { color: theme.colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },

  qrCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: theme.radius.xl,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  qrLoading: { paddingVertical: 50, alignItems: 'center' },
  qrImageWrap: {
    marginTop: 10,
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  qrImage: { width: '100%', height: '100%' },
  upiRow: {
    marginTop: 12,
    flexDirection: 'row', alignItems: 'center',
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  upiLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.muted, letterSpacing: 0.6 },
  upiValue: { fontSize: 14, fontWeight: '700', color: theme.colors.ink, fontFamily: 'monospace', marginTop: 2 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: theme.colors.brand100, borderRadius: theme.radius.pill,
  },
  copyText: { color: theme.colors.brand700, fontWeight: '800', fontSize: 11 },
  downloadBtn: {
    marginTop: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: theme.colors.brand50,
    borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.brand200,
  },
  downloadText: { color: theme.colors.brand700, fontWeight: '800', fontSize: 13 },
  downloadHint: {
    color: theme.colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center', lineHeight: 16,
  },

  formCard: {
    marginTop: 12,
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

  error: { color: theme.colors.danger, fontSize: 13, marginTop: 10 },
  cta: {
    marginTop: 16, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: theme.radius.pill,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  note: { color: theme.colors.muted, fontSize: 11, marginTop: 12, lineHeight: 16 },
  muted: { color: theme.colors.muted },

  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  doneIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#16a34a',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  doneTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.ink },
  doneBody: { fontSize: 14, color: theme.colors.muted, textAlign: 'center', marginTop: 6, lineHeight: 20, maxWidth: 320 },
  bonusInline: { color: '#b45309', fontWeight: '700' },
});
