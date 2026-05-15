import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { theme } from '../theme.js';

/**
 * Minimal signup — first/last name, gender, email, password, DOB.
 * Mirrors the web's required-fields contract so the same backend
 * /auth/signup endpoint validates without surprises. Creator-only
 * fields (verification photo, packages) are deferred to a follow-up
 * "complete your creator profile" flow on the web for now.
 */
export default function Signup({ navigation }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    gender: '',
    email: '',
    password: '',
    dateOfBirth: '',
    referralCode: '',
  });
  const [agree, setAgree] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (error) setError(null);
  };

  const submit = async () => {
    if (!form.firstName.trim()) return setError('Please enter your first name.');
    if (!form.lastName.trim()) return setError('Please enter your last name.');
    if (!form.gender) return setError('Please pick girl or boy.');
    if (!form.email.trim()) return setError('Please enter your email.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return setError('That doesn’t look like a valid email.');
    if (form.password.length < 6) return setError('Password must be 6+ characters.');
    if (!form.dateOfBirth) return setError('Please enter your date of birth (YYYY-MM-DD).');
    if (!agree) return setError('Please accept the Terms.');

    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const username = `${form.firstName}${form.lastName}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 18) + Math.floor(Math.random() * 9000 + 1000);

    setLoading(true);
    try {
      const payload = {
        email: form.email.trim(),
        username,
        password: form.password,
        displayName: fullName,
        dateOfBirth: form.dateOfBirth,
        ...(form.gender === 'female' ? { role: 'provider' } : {}),
        ...(form.referralCode.trim() ? { referralCode: form.referralCode.trim() } : {}),
        consent: {
          fullName,
          signature: fullName,
          acceptedAt: new Date().toISOString(),
          version: 'rn-2026-05',
        },
      };
      const { data } = await api.post('/auth/signup', payload);
      useAuthStore.getState().setAuth(data);
      try {
        const me = await api.get('/users/me');
        const userPayload = me?.data?.user || me?.data;
        if (userPayload) useAuthStore.getState().setUser(userPayload);
      } catch { /* non-fatal */ }
    } catch (err) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>callnade</Text>
          <Text style={styles.title}>Create your account</Text>

          <View style={styles.row}>
            <Field label="First name" style={{ flex: 1 }}>
              <TextInput
                value={form.firstName}
                onChangeText={(v) => set('firstName', v)}
                placeholder="John"
                placeholderTextColor={theme.colors.mutedSoft}
                style={styles.input}
              />
            </Field>
            <Field label="Last name" style={{ flex: 1 }}>
              <TextInput
                value={form.lastName}
                onChangeText={(v) => set('lastName', v)}
                placeholder="Doe"
                placeholderTextColor={theme.colors.mutedSoft}
                style={styles.input}
              />
            </Field>
          </View>

          <Field label="I am a">
            <View style={styles.row}>
              <GenderTile
                active={form.gender === 'female'}
                onPress={() => set('gender', 'female')}
                label="Girl (creator)"
              />
              <GenderTile
                active={form.gender === 'male'}
                onPress={() => set('gender', 'male')}
                label="Boy (user)"
              />
            </View>
          </Field>

          <Field label="Email">
            <TextInput
              value={form.email}
              onChangeText={(v) => set('email', v)}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.mutedSoft}
              style={styles.input}
            />
          </Field>

          <Field label="Password">
            <TextInput
              value={form.password}
              onChangeText={(v) => set('password', v)}
              secureTextEntry
              placeholder="At least 6 characters"
              placeholderTextColor={theme.colors.mutedSoft}
              style={styles.input}
            />
          </Field>

          <Field label="Date of birth (YYYY-MM-DD)">
            <TextInput
              value={form.dateOfBirth}
              onChangeText={(v) => set('dateOfBirth', v)}
              placeholder="2000-01-01"
              placeholderTextColor={theme.colors.mutedSoft}
              style={styles.input}
            />
          </Field>

          <Field label="Referral code (optional)">
            <TextInput
              value={form.referralCode}
              onChangeText={(v) => set('referralCode', v.toUpperCase())}
              autoCapitalize="characters"
              placeholder="ABCD2345"
              placeholderTextColor={theme.colors.mutedSoft}
              style={[styles.input, { fontFamily: 'monospace' }]}
            />
          </Field>

          <Pressable
            onPress={() => setAgree((v) => !v)}
            style={styles.agreeRow}
          >
            <View style={[styles.tick, agree && styles.tickOn]}>
              {agree && <Text style={styles.tickMark}>✓</Text>}
            </View>
            <Text style={styles.agreeText}>
              I agree to the{' '}
              <Text style={{ color: theme.colors.tinder, fontWeight: '600' }}>
                Terms & Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={loading}
            style={({ pressed }) => [
              styles.cta,
              pressed && { transform: [{ translateY: 1 }] },
              loading && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.ctaText}>
              {loading ? 'Creating…' : 'Create account'}
            </Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Login')} hitSlop={12}>
            <Text style={styles.link}>
              Already have an account? <Text style={styles.linkBold}>Log in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children, style }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function GenderTile({ active, onPress, label }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.gender, active && styles.genderActive]}
    >
      <Text style={[styles.genderText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: 24, gap: 14, paddingBottom: 60 },
  brand: { fontSize: 22, fontWeight: '800', color: theme.colors.tinder, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: theme.colors.ink, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.ink },
  input: {
    backgroundColor: '#fff',
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.ink,
  },
  gender: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  genderActive: { backgroundColor: theme.colors.tinder, borderColor: theme.colors.tinder },
  genderText: { fontWeight: '600', color: theme.colors.ink },
  agreeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 6 },
  tick: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: theme.colors.border, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  tickOn: { backgroundColor: theme.colors.tinder, borderColor: theme.colors.tinder },
  tickMark: { color: '#fff', fontWeight: '900' },
  agreeText: { color: theme.colors.muted, fontSize: 13, flex: 1 },
  error: { color: theme.colors.danger, fontSize: 13, marginTop: 4 },
  cta: {
    backgroundColor: theme.colors.ink, borderRadius: theme.radius.pill,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { textAlign: 'center', color: theme.colors.muted, marginTop: 16, fontSize: 13 },
  linkBold: { color: theme.colors.ink, fontWeight: '700' },
});
