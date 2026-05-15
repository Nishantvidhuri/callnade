import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api } from '../services/api.js';
import { fmtCredits } from '../utils/formatCredits.js';
import { theme } from '../theme.js';

/**
 * Admin → Users. Direct port of the most-used controls on
 * `frontend/src/pages/Admin.jsx`:
 *
 *   - Search (250ms debounce)
 *   - Sort toggle: newest ↔ oldest
 *   - Per-row actions: Ban / Unban, Soft delete / Restore
 *
 * Balance editing is deferred to the web for now — needs the
 * inline form (modal) which is heavier than the action sheet here.
 */
export default function AdminUsers({ navigation }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  // Balance editor — open while editing is non-null; carries the
  // user whose wallet/earnings we're adjusting.
  const [editing, setEditing] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const load = useCallback(async (nextCursor) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/users', {
        params: { cursor: nextCursor || undefined, q: debounced || undefined, sort },
      });
      setItems((prev) => (nextCursor ? [...prev, ...data.items] : data.items || []));
      setCursor(data.nextCursor || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debounced, sort]);

  useEffect(() => { load(null); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(null); };
  const onEnd = () => { if (cursor && !loading) load(cursor); };

  const act = async (userId, verb) => {
    setBusy(userId);
    try {
      // Backend endpoint paths: ban / unban / soft-delete / restore.
      const path = verb === 'delete' ? 'soft-delete' : verb;
      await api.post(`/admin/users/${userId}/${path}`);
      // Quick local patch so the row reflects the new state without a
      // refetch. A pull-to-refresh confirms server state.
      setItems((prev) => prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              banned: verb === 'ban' ? true : verb === 'unban' ? false : u.banned,
              deletedAt: verb === 'delete' ? new Date().toISOString()
                : verb === 'restore' ? null
                : u.deletedAt,
            }
          : u
      ));
    } catch (e) {
      Alert.alert('Action failed', e.message);
    } finally {
      setBusy(null);
    }
  };

  const confirm = (label, msg, run) =>
    Alert.alert(label, msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: run },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={6}>
          <Feather name="arrow-left" size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.title}>Users</Text>
        <Pressable
          onPress={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
          style={styles.iconBtn}
          hitSlop={6}
        >
          <Feather name="arrow-up" size={16} color={sort === 'oldest' ? theme.colors.brand600 : theme.colors.ink} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={theme.colors.mutedSoft} style={{ marginLeft: 12 }} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username, email, or displayName"
          placeholderTextColor={theme.colors.mutedSoft}
          style={styles.search}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id || it._id)}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            busy={busy === item.id}
            onBan={() => confirm('Ban user', `Ban @${item.username}? They will be logged out and blocked from signing in.`, () => act(item.id, 'ban'))}
            onUnban={() => act(item.id, 'unban')}
            onDelete={() => confirm('Soft delete', `Soft-delete @${item.username}? Their profile becomes invisible but data is retained.`, () => act(item.id, 'delete'))}
            onRestore={() => act(item.id, 'restore')}
            onEdit={() => setEditing(item)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator color={theme.colors.tinder} /></View>
          ) : (
            <View style={styles.empty}><Text style={{ color: theme.colors.muted }}>No users found.</Text></View>
          )
        }
        onEndReachedThreshold={0.4}
        onEndReached={onEnd}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tinder} />
        }
      />

      <BalanceEditor
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={({ wallet, earnings }) => {
          setItems((prev) =>
            prev.map((u) =>
              u.id === editing?.id
                ? { ...u, walletBalance: wallet, earningsBalance: earnings }
                : u,
            ),
          );
        }}
      />
    </SafeAreaView>
  );
}

function UserRow({ user, busy, onBan, onUnban, onDelete, onRestore, onEdit }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {user.displayName || user.username}
          </Text>
          {user.role === 'provider' && <Chip color="#b45309" bg="#fef3c7" label="CREATOR" />}
          {user.role === 'admin' && <Chip color={theme.colors.brand700} bg={theme.colors.brand100} label="ADMIN" />}
          {user.banned && <Chip color="#dc2626" bg="#fee2e2" label="BANNED" />}
          {user.deletedAt && <Chip color="#525252" bg="#e5e5e5" label="DELETED" />}
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          @{user.username}{user.email ? ` · ${user.email}` : ''}
        </Text>
        <Text style={styles.handle}>
          Wallet ₹{fmtCredits(user.walletBalance || 0)}
          {(user.earningsBalance || 0) > 0 ? `  ·  Earn ₹${fmtCredits(user.earningsBalance)}` : ''}
        </Text>
      </View>

      <View style={styles.actions}>
        {busy ? (
          <ActivityIndicator color={theme.colors.tinder} />
        ) : (
          <>
            <ActionBtn icon="edit-2" label="Edit" tone="brand" onPress={onEdit} />
            {user.banned ? (
              <ActionBtn icon="rotate-ccw" label="Unban" onPress={onUnban} />
            ) : (
              <ActionBtn icon="slash" label="Ban" tone="danger" onPress={onBan} />
            )}
            {user.deletedAt ? (
              <ActionBtn icon="rotate-ccw" label="Restore" onPress={onRestore} />
            ) : (
              <ActionBtn icon="trash-2" label="Del" tone="danger" onPress={onDelete} />
            )}
          </>
        )}
      </View>
    </View>
  );
}

function Chip({ label, color, bg }) {
  return (
    <View style={{
      backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: theme.radius.pill,
    }}>
      <Text style={{ color, fontWeight: '800', fontSize: 9, letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

function ActionBtn({ icon, label, onPress, tone }) {
  const palette =
    tone === 'danger'
      ? { bg: '#fee2e2', border: '#fecaca', fg: '#dc2626' }
      : tone === 'brand'
        ? { bg: theme.colors.brand50, border: theme.colors.brand200, fg: theme.colors.brand700 }
        : { bg: '#fff', border: theme.colors.border, fg: theme.colors.ink };
  return (
    <Pressable
      onPress={onPress}
      style={[styles.actionBtn, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Feather name={icon} size={11} color={palette.fg} />
      <Text style={[styles.actionBtnText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Modal balance editor. Backend takes a `delta` (relative change) for
 * both /wallet and /earnings, so we let the admin type the desired
 * absolute value and compute the diff. We POST only the endpoints
 * whose value actually changed — saves a round trip when only one
 * field was edited.
 */
function BalanceEditor({ user, onClose, onSaved }) {
  const open = !!user;
  const [wallet, setWallet] = useState('');
  const [earnings, setEarnings] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    setWallet(String(user.walletBalance ?? 0));
    setEarnings(String(user.earningsBalance ?? 0));
    setErr(null);
  }, [open, user]);

  if (!open) return null;

  const parseNum = (v) => {
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const save = async () => {
    setErr(null);
    const newWallet = parseNum(wallet);
    const newEarnings = parseNum(earnings);
    if (newWallet == null || newEarnings == null) {
      setErr('Enter valid numbers for both fields.');
      return;
    }
    const dWallet = round2(newWallet - (user.walletBalance ?? 0));
    const dEarn = round2(newEarnings - (user.earningsBalance ?? 0));
    if (dWallet === 0 && dEarn === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      if (dWallet !== 0) {
        await api.post(`/admin/users/${user.id}/wallet`, { delta: dWallet });
      }
      if (dEarn !== 0) {
        await api.post(`/admin/users/${user.id}/earnings`, { delta: dEarn });
      }
      onSaved?.({ wallet: newWallet, earnings: newEarnings });
      onClose();
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Edit balances</Text>
            <Pressable onPress={onClose} hitSlop={6}>
              <Feather name="x" size={18} color={theme.colors.ink} />
            </Pressable>
          </View>
          <Text style={styles.modalSub}>
            @{user.username}
            {user.role === 'provider' ? '  ·  CREATOR' : ''}
          </Text>

          <Field label="Wallet (credits)">
            <TextInput
              value={wallet}
              onChangeText={setWallet}
              keyboardType="numeric"
              style={styles.input}
              placeholder="0"
              placeholderTextColor={theme.colors.mutedSoft}
            />
            <Text style={styles.deltaHint}>
              Current: {fmtCredits(user.walletBalance ?? 0)} ·
              Δ {fmtDelta((parseNum(wallet) ?? 0) - (user.walletBalance ?? 0))}
            </Text>
          </Field>

          <Field label="Earnings (credits)">
            <TextInput
              value={earnings}
              onChangeText={setEarnings}
              keyboardType="numeric"
              style={styles.input}
              placeholder="0"
              placeholderTextColor={theme.colors.mutedSoft}
            />
            <Text style={styles.deltaHint}>
              Current: {fmtCredits(user.earningsBalance ?? 0)} ·
              Δ {fmtDelta((parseNum(earnings) ?? 0) - (user.earningsBalance ?? 0))}
            </Text>
          </Field>

          {err && <Text style={styles.modalError}>{err}</Text>}

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.modalBtn, styles.modalBtnGhost]}>
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={[styles.modalBtn, styles.modalBtnPrimary, saving && { opacity: 0.6 }]}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

const round2 = (n) => Math.round(n * 100) / 100;
const fmtDelta = (d) => {
  const v = round2(d);
  if (v === 0) return '0';
  return `${v > 0 ? '+' : ''}${fmtCredits(v)}`;
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: theme.colors.ink },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginHorizontal: 14,
  },
  search: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, fontSize: 14, color: theme.colors.ink },
  error: { color: theme.colors.danger, paddingHorizontal: 14, paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 8,
  },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontWeight: '700', color: theme.colors.ink, fontSize: 14 },
  handle: { color: theme.colors.muted, fontSize: 11 },
  actions: { gap: 6, justifyContent: 'center' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 11, fontWeight: '700' },
  empty: { padding: 30, alignItems: 'center' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.xl,
    padding: 18,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.ink },
  modalSub: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.ink, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.ink,
    backgroundColor: '#fff',
  },
  deltaHint: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },
  modalError: { color: theme.colors.danger, fontSize: 13, marginTop: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: {
    flex: 1, height: 44, borderRadius: theme.radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border },
  modalBtnGhostText: { fontWeight: '700', color: theme.colors.ink },
  modalBtnPrimary: { backgroundColor: theme.colors.tinder },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '700' },
});
