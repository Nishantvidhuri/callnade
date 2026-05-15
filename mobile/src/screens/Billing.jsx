import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';
import { theme } from '../theme.js';

/**
 * Billing screen — direct port of `frontend/src/pages/Billing.jsx`.
 *
 * Three wallet cards stacked top-down:
 *   1. Wallet (emerald)         — caller credits; "+ Add credits".
 *   2. Earnings (amber)         — creator income; "Withdraw".
 *      Only renders for providers / admins.
 *   3. Referral wallet (amber)  — referrer bonuses; "Withdraw".
 *      Only renders when there's a non-zero balance.
 *
 * Below the cards: All / Incoming / Outgoing tabs and a transaction
 * list pulled from `/calls/transactions`.
 *
 * Top-up + withdraw upload flows still live on the web for now (they
 * need image-pick + multipart upload; will port in a later phase).
 * The action buttons here show a "use the web for now" prompt so the
 * UX is graceful instead of dead-clicking.
 */
export default function Billing({ navigation }) {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const isProvider = me?.role === 'provider' || me?.role === 'admin' || me?.isAdmin;

  const [tab, setTab] = useState('all');
  const [transactions, setTransactions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ spent: 0, spentCalls: 0, earned: 0, earnedCalls: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [meRes, txRes, reqRes] = await Promise.all([
        api.get('/users/me'),
        api.get('/calls/transactions', { params: { limit: 30 } }),
        api.get('/wallet/requests'),
      ]);
      // /users/me returns { user, avatar, gallery } — keep the user.
      const userPayload = meRes?.data?.user || meRes?.data;
      if (userPayload) setUser(userPayload);
      const items = txRes.data?.items || [];
      setTransactions(items);
      setRequests(reqRes.data?.items || []);

      // Derived totals — matches the web's "spent on calls" / "earned
      // from calls" stat lines under each card.
      let spent = 0, spentCalls = 0, earned = 0, earnedCalls = 0;
      for (const t of items) {
        if (t.direction === 'outgoing' || t.kind === 'call-spend') {
          spent += Math.abs(t.amount || 0);
          spentCalls += 1;
        }
        if (t.direction === 'incoming' || t.kind === 'call-earn') {
          earned += Math.abs(t.amount || 0);
          earnedCalls += 1;
        }
      }
      setStats({ spent, spentCalls, earned, earnedCalls });
    } catch (err) {
      setError(err.message || 'Failed to load billing');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setUser]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const visibleTx = useMemo(() => {
    if (tab === 'incoming') return transactions.filter((t) => (t.amount || 0) > 0 || t.direction === 'incoming');
    if (tab === 'outgoing') return transactions.filter((t) => (t.amount || 0) < 0 || t.direction === 'outgoing');
    return transactions;
  }, [tab, transactions]);

  const goAddCredits = () => navigation.navigate('AddCredits');
  const goWithdraw = (source) => navigation.navigate('Withdraw', { source });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Page header — mirrors the web's `<header>` block. */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation?.canGoBack?.() && navigation.goBack()}
          style={styles.iconBtn}
          hitSlop={6}
        >
          <Feather name="arrow-left" size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Wallet</Text>
          <Text style={styles.subtitle}>Your incoming and outgoing call payments.</Text>
        </View>
        <Pressable onPress={onRefresh} style={styles.iconBtn} hitSlop={6}>
          <Feather name="refresh-ccw" size={16} color={theme.colors.ink} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.tinder} />
        </View>
      ) : (
        <FlatList
          data={visibleTx}
          keyExtractor={(t) => String(t.id || t._id || `${t.callId}-${t.createdAt}`)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListHeaderComponent={
            <>
              {/* Wallet card */}
              <WalletCard
                tone="emerald"
                icon="credit-card"
                label="WALLET"
                value={me?.walletBalance ?? 0}
                ctaLabel="+ Add credits"
                onCtaPress={goAddCredits}
                footLeft="Spent on calls"
                footRight={`${fmtCredits(stats.spent)} · ${stats.spentCalls} ${stats.spentCalls === 1 ? 'call' : 'calls'}`}
              />

              {/* Earnings (creator/admin only) */}
              {isProvider && (
                <WalletCard
                  tone="amber"
                  icon="credit-card"
                  label="EARNINGS"
                  value={me?.earningsBalance ?? 0}
                  ctaLabel="Withdraw"
                  ctaIcon="download"
                  onCtaPress={() => goWithdraw('earnings')}
                  footLeft="Earned from calls"
                  footRight={`${fmtCredits(stats.earned)} · ${stats.earnedCalls} ${stats.earnedCalls === 1 ? 'call' : 'calls'}`}
                />
              )}

              {/* Referral wallet — hidden when zero balance to match web. */}
              {(me?.referralWalletBalance ?? 0) > 0 && (
                <WalletCard
                  tone="amber"
                  icon="credit-card"
                  label="REFERRAL WALLET"
                  value={me?.referralWalletBalance ?? 0}
                  ctaLabel="Withdraw"
                  ctaIcon="download"
                  onCtaPress={() => goWithdraw('referral')}
                  footLeft="Earned from referrals"
                  footRight={`${fmtCredits(me?.referralEarnings ?? 0)} · ${me?.referralCount ?? 0} ${(me?.referralCount ?? 0) === 1 ? 'referral' : 'referrals'}`}
                />
              )}

              {/* Tabs */}
              <View style={styles.tabs}>
                {['all', 'incoming', 'outgoing'].map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setTab(t)}
                    style={[styles.tab, tab === t && styles.tabOn]}
                  >
                    <Feather
                      name={t === 'incoming' ? 'arrow-down-left' : t === 'outgoing' ? 'arrow-up-right' : 'list'}
                      size={12}
                      color={tab === t ? '#fff' : theme.colors.ink}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
                      {t === 'all' ? 'All' : t === 'incoming' ? 'Incoming' : 'Outgoing'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {!!error && <Text style={styles.error}>{error}</Text>}
            </>
          }
          renderItem={({ item }) => <TxRow tx={item} isCreator={isProvider} />}
          ListEmptyComponent={
            <View style={styles.emptyTx}>
              <Text style={styles.muted}>No transactions yet.</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tinder} />
          }
        />
      )}
    </SafeAreaView>
  );
}

function WalletCard({ tone, icon, label, value, ctaLabel, ctaIcon, onCtaPress, footLeft, footRight }) {
  const palette = TONE[tone];
  return (
    <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.bg }]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: palette.iconBg }]}>
          <Feather name={icon} size={18} color={palette.iconFg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, { color: palette.iconFg }]}>{label}</Text>
          <Text style={[styles.cardValue, { color: palette.iconFg }]}>
            {fmtCredits(value)} <Text style={styles.cardValueUnit}>credits</Text>
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onCtaPress}
        style={[styles.cardCta, { backgroundColor: palette.cta }]}
      >
        {ctaIcon ? (
          <Feather name={ctaIcon} size={14} color="#fff" style={{ marginRight: 6 }} />
        ) : null}
        <Text style={styles.cardCtaText}>{ctaLabel}</Text>
      </Pressable>
      <View style={styles.cardFoot}>
        <Text style={styles.cardFootLabel}>{footLeft}</Text>
        <Text style={styles.cardFootValue}>{footRight}</Text>
      </View>
    </View>
  );
}

const TONE = {
  emerald: {
    bg: '#ffffff',
    border: '#a7f3d0',
    iconBg: '#d1fae5',
    iconFg: '#047857',
    cta: '#10b981',
  },
  amber: {
    bg: '#ffffff',
    border: '#fde68a',
    iconBg: '#fef3c7',
    iconFg: '#b45309',
    cta: '#f59e0b',
  },
};

/**
 * Single pending wallet-request row — top-up or withdraw. Shows the
 * direction, amount, and a tiny status pill that explains it's still
 * being reviewed by an admin.
 */
function PendingRow({ req }) {
  const isTopup = req.type === 'topup';
  const created = req.createdAt ? new Date(req.createdAt).toLocaleString() : '';
  const ref = isTopup ? (req.referenceId || null) : (req.upiId || null);
  return (
    <View style={styles.pendingRow}>
      <View style={[styles.pendingIcon, { backgroundColor: isTopup ? '#dcfce7' : '#fef3c7' }]}>
        <Feather
          name={isTopup ? 'arrow-down-left' : 'arrow-up-right'}
          size={14}
          color={isTopup ? '#15803d' : '#b45309'}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pendingLabel}>
          {isTopup ? 'Top-up request' : 'Withdrawal request'}
        </Text>
        {ref ? (
          <Text style={styles.pendingMeta} numberOfLines={1}>
            {isTopup ? `Ref: ${ref}` : `To: ${ref}`}
          </Text>
        ) : null}
        {created ? <Text style={styles.pendingTime}>{created}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.pendingAmount, { color: isTopup ? '#047857' : '#b45309' }]}>
          {isTopup ? '+' : '−'}₹{fmtCredits(req.amount || 0)}
        </Text>
        <View style={styles.pendingPill}>
          <View style={styles.pendingPillDot} />
          <Text style={styles.pendingPillText}>PENDING</Text>
        </View>
      </View>
    </View>
  );
}

function TxRow({ tx, isCreator = false }) {
  const amount = tx.amount || 0;
  // For creator accounts every call row is what the *caller* spent
  // to reach them — they want to see that as an outgoing-style
  // figure (red minus) rather than a green plus, since they
  // already track their own earnings via the EARNINGS card. The
  // sign is purely cosmetic here; the actual ledger row is
  // unchanged.
  const isOut = isCreator ? true : amount < 0;
  // Backend may return either flattened fields (peerDisplayName /
  // peerUsername) OR a nested peer object {id, username,
  // displayName, avatarUrl}. Handle both — rendering the bare
  // object as a child crashes RN with "Objects are not valid as a
  // React child".
  const peer =
    tx.peer?.displayName ||
    tx.peer?.username ||
    tx.peerDisplayName ||
    tx.peerUsername ||
    (typeof tx.peer === 'string' ? tx.peer : null) ||
    'Someone';
  const when = tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '';
  const rate = tx.perMinuteRate ? `${tx.perMinuteRate} cr/min` : null;
  const duration = tx.durationSec
    ? `${Math.max(1, Math.round(tx.durationSec))}s`
    : null;
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: isOut ? '#fee2e2' : '#dcfce7' }]}>
        <Feather
          name={isOut ? 'phone-outgoing' : 'phone-incoming'}
          size={14}
          color={isOut ? '#b91c1c' : '#15803d'}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txName} numberOfLines={1}>
          {peer}{' '}
          <Text style={styles.txKind}>{isOut ? 'OUTGOING' : 'INCOMING'}</Text>
        </Text>
        <Text style={styles.txMeta} numberOfLines={1}>
          {[duration, rate].filter(Boolean).join('  ·  ')}
        </Text>
        {when ? <Text style={styles.txTime}>{when}</Text> : null}
      </View>
      <Text style={[styles.txAmount, { color: isOut ? '#dc2626' : '#15803d' }]}>
        {isOut ? '−' : '+'}
        {fmtCredits(Math.abs(amount))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: theme.colors.muted },
  error: { color: theme.colors.danger, marginVertical: 10, fontSize: 13 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.ink },
  subtitle: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },

  card: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  cardValue: { fontSize: 28, fontWeight: '800', marginTop: 2 },
  cardValueUnit: { fontSize: 13, color: theme.colors.muted, fontWeight: '600' },
  cardCta: {
    marginTop: 12,
    height: 46,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  cardCtaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardFoot: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardFootLabel: { color: theme.colors.muted, fontSize: 12 },
  cardFootValue: { color: theme.colors.ink, fontSize: 13, fontWeight: '700' },

  pendingWrap: {
    marginTop: 16,
    padding: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    gap: 8,
  },
  pendingHead: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.6,
    color: '#b45309',
    marginBottom: 4,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  pendingIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  pendingLabel: { color: theme.colors.ink, fontWeight: '700', fontSize: 13 },
  pendingMeta: { color: theme.colors.muted, fontSize: 11, marginTop: 2 },
  pendingTime: { color: theme.colors.mutedSoft, fontSize: 10, marginTop: 2 },
  pendingAmount: { fontWeight: '800', fontSize: 14 },
  pendingPill: {
    marginTop: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: '#fef3c7', borderRadius: theme.radius.pill,
  },
  pendingPillDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#b45309' },
  pendingPillText: { color: '#b45309', fontWeight: '800', fontSize: 9, letterSpacing: 0.5 },

  tabs: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#fff',
  },
  tabOn: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  tabText: { color: theme.colors.ink, fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: '#fff' },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 8,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txName: { fontSize: 14, fontWeight: '700', color: theme.colors.ink },
  txKind: { fontSize: 10, fontWeight: '800', color: theme.colors.muted, letterSpacing: 0.4 },
  txMeta: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  txTime: { color: theme.colors.mutedSoft, fontSize: 11, marginTop: 2 },
  txAmount: { fontSize: 16, fontWeight: '800' },
  emptyTx: { padding: 28, alignItems: 'center' },
});
