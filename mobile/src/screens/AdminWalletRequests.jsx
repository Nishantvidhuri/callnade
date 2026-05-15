import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api } from '../services/api.js';
import { fmtCredits } from '../utils/formatCredits.js';
import { theme } from '../theme.js';

/**
 * Admin → Wallet requests. Lists pending top-ups and withdrawals
 * and lets the admin approve/reject either type. The QR screenshot
 * preview lives on the web for now (image-pick + zoom-modal flow);
 * here we surface the key metadata + the action verbs.
 */
const TABS = [
  { key: 'topup',    label: 'Top-ups',  icon: 'arrow-down-left' },
  { key: 'withdraw', label: 'Withdraw', icon: 'arrow-up-right' },
];

export default function AdminWalletRequests({ navigation }) {
  const [tab, setTab] = useState('topup');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch ALL statuses (pending + approved + rejected) so the
      // admin sees the full history. The tab only filters by type;
      // the per-row status pill below tells them what's still
      // actionable.
      const [list, st] = await Promise.all([
        api.get('/admin/wallet-requests', { params: { type: tab, limit: 60 } }),
        api.get('/admin/wallet-stats').catch(() => null),
      ]);
      setItems(list.data?.items || []);
      if (st?.data) setStats(st.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const patchStatus = (id, status) =>
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));

  const approve = async (req) => {
    setBusy(req.id);
    try {
      const path = req.type === 'topup' ? 'approve-topup' : 'approve-withdraw';
      await api.post(`/admin/wallet-requests/${req.id}/${path}`);
      patchStatus(req.id, 'approved');
    } catch (e) {
      Alert.alert('Approve failed', e.message);
    } finally { setBusy(null); }
  };

  const reject = async (req) => {
    setBusy(req.id);
    try {
      await api.post(`/admin/wallet-requests/${req.id}/reject`);
      patchStatus(req.id, 'rejected');
    } catch (e) {
      Alert.alert('Reject failed', e.message);
    } finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={6}>
          <Feather name="arrow-left" size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.title}>Billing</Text>
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <Stat label="In" value={`₹${fmtCredits(stats.totalIn ?? 0)}`} />
          <Stat label="Out" value={`₹${fmtCredits(stats.totalOut ?? 0)}`} />
          <Stat label="Profit" value={`₹${fmtCredits(stats.profit ?? 0)}`} tint="brand" />
        </View>
      )}

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabOn]}
          >
            <Feather name={t.icon} size={12} color={tab === t.key ? '#fff' : theme.colors.ink} style={{ marginRight: 6 }} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(r) => String(r.id || r._id)}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 30 }}
        renderItem={({ item }) => (
          <RequestRow
            req={item}
            busy={busy === item.id}
            onApprove={() => approve(item)}
            onReject={() => reject(item)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator color={theme.colors.tinder} /></View>
          ) : (
            <View style={styles.empty}>
              <Text style={{ color: theme.colors.muted }}>No pending {tab === 'topup' ? 'top-ups' : 'withdrawals'}.</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tinder} />
        }
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, tint }) {
  return (
    <View style={[styles.statBox, tint === 'brand' && { borderColor: theme.colors.brand200 }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tint === 'brand' && { color: theme.colors.brand700 }]}>{value}</Text>
    </View>
  );
}

function RequestRow({ req, busy, onApprove, onReject }) {
  const isTopup = req.type === 'topup';
  const peer = req.user?.displayName || req.user?.username || 'User';
  const handle = req.user?.username ? `@${req.user.username}` : '';
  const created = req.createdAt ? new Date(req.createdAt).toLocaleString() : '';
  const isPending = req.status === 'pending';
  const netNote = !isTopup && req.feeRate
    ? `Pay out ₹${fmtCredits(req.netAmount ?? req.amount)} · −${Math.round(req.feeRate * 100)}% fee`
    : null;

  const statusPill = STATUS_PILL[req.status] || STATUS_PILL.pending;

  return (
    <View style={[styles.row, !isPending && { opacity: 0.92 }]}>
      <View style={{ flex: 1 }}>
        <View style={styles.rowHead}>
          <Text style={styles.rowName} numberOfLines={1}>{peer}</Text>
          <Text style={styles.rowHandle} numberOfLines={1}>{handle}</Text>
        </View>
        <View style={styles.rowAmountLine}>
          <Text style={[styles.rowAmount, { color: isTopup ? '#047857' : '#b45309' }]}>
            {isTopup ? '+' : '−'}₹{fmtCredits(req.amount || 0)}
          </Text>
          <Text style={styles.rowKind}>{isTopup ? 'TOP-UP' : 'WITHDRAW'}</Text>
          <View style={[styles.statusChip, { backgroundColor: statusPill.bg }]}>
            <Text style={[styles.statusChipText, { color: statusPill.fg }]}>
              {statusPill.label}
            </Text>
          </View>
        </View>
        {netNote && <Text style={styles.rowSub}>{netNote}</Text>}
        {isTopup && req.referenceId && (
          <Text style={styles.rowSub} numberOfLines={1}>Ref: {req.referenceId}</Text>
        )}
        {!isTopup && req.upiId && (
          <Text style={styles.rowSub} numberOfLines={1}>UPI: {req.upiId}</Text>
        )}
        {created && <Text style={styles.rowTime}>{created}</Text>}
      </View>

      {isPending && (
        <View style={styles.rowActions}>
          {busy ? (
            <ActivityIndicator color={theme.colors.tinder} />
          ) : (
            <>
              <Pressable onPress={onApprove} style={[styles.actionBtn, { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' }]}>
                <Feather name="check" size={12} color="#15803d" strokeWidth={3} />
                <Text style={[styles.actionBtnText, { color: '#15803d' }]}>Approve</Text>
              </Pressable>
              <Pressable onPress={onReject} style={[styles.actionBtn, { backgroundColor: '#fee2e2', borderColor: '#fecaca' }]}>
                <Feather name="x" size={12} color="#dc2626" strokeWidth={3} />
                <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>Reject</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const STATUS_PILL = {
  pending:  { bg: '#fef3c7', fg: '#b45309', label: 'PENDING' },
  approved: { bg: '#dcfce7', fg: '#15803d', label: 'APPROVED' },
  rejected: { bg: '#fee2e2', fg: '#dc2626', label: 'REJECTED' },
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.ink, flex: 1 },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 6 },
  statBox: {
    flex: 1, padding: 10, borderRadius: theme.radius.lg,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border,
  },
  statLabel: { color: theme.colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { color: theme.colors.ink, fontSize: 16, fontWeight: '800', marginTop: 2 },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff',
  },
  tabOn: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  tabText: { color: theme.colors.ink, fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: '#fff' },

  error: { color: theme.colors.danger, paddingHorizontal: 14, paddingTop: 6 },

  row: {
    flexDirection: 'row', gap: 10,
    backgroundColor: '#fff', borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: 12,
  },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  rowName: { fontWeight: '700', color: theme.colors.ink, fontSize: 14 },
  rowHandle: { color: theme.colors.muted, fontSize: 12 },
  rowAmountLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rowAmount: { fontSize: 18, fontWeight: '800' },
  rowKind: { color: theme.colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  statusChip: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  statusChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  rowSub: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  rowTime: { color: theme.colors.mutedSoft, fontSize: 11, marginTop: 4 },
  rowActions: { gap: 6, justifyContent: 'center' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.pill, borderWidth: 1,
  },
  actionBtnText: { fontSize: 11, fontWeight: '700' },
  empty: { padding: 30, alignItems: 'center' },
});
