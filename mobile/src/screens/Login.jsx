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
 * Email + password login. Hits POST /auth/login on the live backend
 * and stores the returned token in the auth store (which also
 * persists it to AsyncStorage for cold-start re-hydration).
 */
export default function Login({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim()) return setError('Please enter your email.');
    if (!password) return setError('Please enter your password.');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        email: email.trim(),
        password,
      });
      useAuthStore.getState().setAuth(data);
      // Hydrate the full user (wallet / earnings / referral balances).
      // /users/me returns { user, avatar, gallery } — unwrap so the
      // store holds the user object itself.
      try {
        const me = await api.get('/users/me');
        const userPayload = me?.data?.user || me?.data;
        if (userPayload) useAuthStore.getState().setUser(userPayload);
      } catch { /* non-fatal */ }
    } catch (err) {
      setError(err.message || 'Login failed');
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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to continue.</Text>

          <Field label="Email">
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.mutedSoft}
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
          </Field>

          <Field label="Password">
            <TextInput
              secureTextEntry
              autoComplete="password"
              placeholder="At least 6 characters"
              placeholderTextColor={theme.colors.mutedSoft}
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
          </Field>

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
            <Text style={styles.ctaText}>{loading ? 'Logging in…' : 'Log in'}</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate('Signup')} hitSlop={12}>
            <Text style={styles.link}>
              Don’t have an account? <Text style={styles.linkBold}>Sign up</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: 24, gap: 14 },
  brand: { fontSize: 22, fontWeight: '800', color: theme.colors.tinder, marginBottom: 12 },
  title: { fontSize: 30, fontWeight: '700', color: theme.colors.ink },
  subtitle: { fontSize: 14, color: theme.colors.muted, marginBottom: 8 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.ink },
  input: {
    backgroundColor: '#fff',
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.ink,
  },
  error: { color: theme.colors.danger, fontSize: 13, marginTop: 4 },
  cta: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { textAlign: 'center', color: theme.colors.muted, marginTop: 16, fontSize: 13 },
  linkBold: { color: theme.colors.ink, fontWeight: '700' },
});
