import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';
import { theme } from '../theme.js';
import PresenceDot from '../components/PresenceDot.jsx';

/**
 * Profile — mirrors frontend/src/pages/Profile.jsx:
 *
 *   - Header: avatar + name + handle + bio + subscriber stats (providers).
 *   - Action row: Edit/Billing/Logout (self) OR Subscribe (other).
 *   - Gallery: photos grid (hero placement when viewer is a regular
 *     user looking at a creator).
 *   - Sticky bottom Audio/Video CTA (regular user viewing creator).
 *   - Referral card (self only, when referralCode is set).
 *
 * Editing flows (avatar upload, packages manager, recharge modal)
 * live on the web for now — Phase 4 will port them with
 * `expo-image-picker`.
 */
export default function Profile({ route, navigation }) {
  const me = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const username = route?.params?.username || me?.username;
  const isMe = !!(me && username === me.username);

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  // Hook must be called unconditionally — Profile lives inside the
  // tab navigator on both navigation paths so the hook is always
  // resolvable. Falls back to 0 on the off-chance the host renders
  // outside a tab tree.
  const tabBarHeight = useBottomTabBarHeight();

  const load = useCallback(async () => {
    if (!username) return;
    setError(null);
    try {
      const { data: r } = await api.get(`/users/${username}`);
      setData(r);
    } catch (e) {
      setError(e.message || 'Failed to load profile');
    } finally {
      setRefreshing(false);
    }
  }, [username]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  // Auth still hydrating → no username yet. Show a friendly hint
  // instead of an infinite spinner so the screen never feels frozen.
  if (!username) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={[styles.muted, { padding: 16 }]}>Loading your profile…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={[styles.muted, { color: theme.colors.danger, padding: 16, textAlign: 'center' }]}>
          {error}
        </Text>
        <Pressable onPress={load} style={[styles.actionPill, { backgroundColor: '#fff', borderColor: theme.colors.border, marginTop: 12 }]}>
          <Feather name="refresh-ccw" size={14} color={theme.colors.ink} />
          <Text style={styles.actionPillText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  if (!data) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={theme.colors.tinder} />
        <Text style={[styles.muted, { marginTop: 12 }]}>Loading @{username}…</Text>
      </SafeAreaView>
    );
  }

  const u = data.user;
  const rel = data.relationship || {};
  const isCreatorProfile = u.role === 'provider';
  const showStickyCTA =
    !isMe && isCreatorProfile && me?.role !== 'provider' && me?.role !== 'admin';
  const presence = u.presence || (u.online ? 'online' : 'offline');

  const subscribe = async () => {
    setBusy(true);
    try {
      await api.post(`/follow/${u._id || u.id}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };
  const unsubscribe = async () => {
    setBusy(true);
    try {
      await api.delete(`/follow/${u._id || u.id}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const onCall = (callType) => {
    if (presence === 'busy') return;
    navigation.navigate('Call', {
      peerId: u._id || u.id,
      peerLabel: u.displayName || u.username,
      callType,
    });
  };

  const onLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: (showStickyCTA ? 96 : 28) + tabBarHeight,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tinder} />
        }
      >
        {/* Back row (only when pushed from elsewhere) */}
        {navigation?.canGoBack?.() && !isMe && (
          <Pressable onPress={() => navigation.goBack()} style={styles.backRow} hitSlop={8}>
            <Feather name="arrow-left" size={18} color={theme.colors.muted} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        )}

        {/* Header — avatar + name + bio + stats */}
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            {data.avatar?.urls?.thumb ? (
              <Image source={{ uri: data.avatar.urls.thumb }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>
                  {(u.displayName || u.username).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.dotOnAvatar}>
              <PresenceDot status={presence} size={14} showOffline={false} />
            </View>
          </View>

          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {u.displayName || u.username}
              </Text>
              {rel.isFollower && (
                <View style={styles.badge}>
                  <Feather name="check" size={11} color="#fff" strokeWidth={3} />
                  <Text style={styles.badgeText}>Subscribed</Text>
                </View>
              )}
            </View>
            <Text style={styles.handle}>@{u.username}</Text>
            {u.bio ? <Text style={styles.bio}>{u.bio}</Text> : null}

            {isCreatorProfile && (
              <View style={styles.stats}>
                <Text style={styles.statText}>
                  <Text style={styles.statNum}>{fmtNum(u.followerCount)}</Text>
                  <Text style={styles.statLabel}> subscribers</Text>
                </Text>
                <Text style={styles.statText}>
                  <Text style={styles.statNum}>{fmtNum(u.followingCount)}</Text>
                  <Text style={styles.statLabel}> subscribed</Text>
                </Text>
              </View>
            )}

            {u.isPrivate && (
              <View style={styles.privateRow}>
                <Feather name="lock" size={11} color={theme.colors.muted} />
                <Text style={styles.privateText}>Private</Text>
              </View>
            )}
          </View>
        </View>

        {/* Action row */}
        <View style={styles.actionRow}>
          {isMe ? (
            <>
              {/* Wallet pill — non-admins only. Admins reach their
                  own wallet (rarely useful for them) via the top
                  bar's wallet pill if they ever need it; keeping
                  this list short. */}
              {!(me?.role === 'admin' || me?.isAdmin) && (
                <ActionPill
                  icon="credit-card"
                  label="Wallet"
                  onPress={() => navigation.navigate('Billing')}
                />
              )}
              {isCreatorProfile && (
                <ActionPill
                  icon="package"
                  label="Packages"
                  onPress={() => comingSoon('Manage packages')}
                  tone="brand"
                />
              )}
              {/* Admin-only shortcuts — Billing routes straight to
                  the moderation queue (top-ups + withdrawals to
                  approve), Admin opens the broader admin landing
                  with Users / Visits / Payment QRs / Billing. */}
              {(me?.role === 'admin' || me?.isAdmin) && (
                <>
                  <ActionPill
                    icon="file-text"
                    label="Billing"
                    tone="brand"
                    onPress={() => navigation.navigate('AdminWalletRequests')}
                  />
                  <ActionPill
                    icon="shield"
                    label="Admin"
                    tone="brand"
                    onPress={() => navigation.navigate('Admin')}
                  />
                </>
              )}
              <ActionPill icon="log-out" label="Log out" tone="danger" onPress={onLogout} />
            </>
          ) : isCreatorProfile ? (
            <SubscribeButton rel={rel} busy={busy} onSubscribe={subscribe} onUnsubscribe={unsubscribe} />
          ) : null}
        </View>

        {/* Hero gallery — non-self creator view */}
        {!!data.gallery?.length && (
          <View style={styles.gallery}>
            {data.gallery.map((m, idx) => (
              <View key={String(m.id || idx)} style={styles.galleryTile}>
                {m.urls?.thumb ? (
                  <Image source={{ uri: m.urls.thumb }} style={styles.galleryImg} />
                ) : (
                  <View style={[styles.galleryImg, styles.galleryLocked]}>
                    <Feather name="lock" size={22} color={theme.colors.mutedSoft} />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {!isMe && !rel.canViewLocked && (
          <Text style={styles.lockedHint}>
            {rel.hasPendingRequest
              ? 'Subscription request sent. The full gallery unlocks once accepted.'
              : 'Subscribe to unlock the full gallery.'}
          </Text>
        )}

        {/* Referral card — owner only, when a code exists */}
        {isMe && me?.referralCode && <ReferralCard me={me} />}
      </ScrollView>

      {/* Sticky bottom Audio/Video CTA — only when a regular user is
          viewing a creator. Pinned above the bottom tab bar. */}
      {showStickyCTA && (
        <View
          style={[styles.stickyCta, { bottom: tabBarHeight + 8 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => onCall('audio')}
            disabled={presence === 'busy'}
            style={[styles.stickyBtn, styles.audioBtn, presence === 'busy' && styles.btnDisabled]}
          >
            <Feather name="phone" size={16} color={theme.colors.brand700} />
            <Text style={[styles.stickyBtnText, { color: theme.colors.brand700 }]}>
              {presence === 'busy' ? 'In a call' : 'Audio'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onCall('video')}
            disabled={presence === 'busy'}
            style={[styles.stickyBtn, styles.videoBtn, presence === 'busy' && styles.btnDisabled]}
          >
            <Feather name="video" size={17} color="#fff" />
            <Text style={[styles.stickyBtnText, { color: '#fff' }]}>
              {presence === 'busy' ? 'In a call' : 'Video'}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function ActionPill({ icon, label, onPress, tone = 'neutral' }) {
  const palette = TONE[tone] || TONE.neutral;
  return (
    <Pressable onPress={onPress} style={[styles.actionPill, palette.wrap]}>
      <Feather name={icon} size={14} color={palette.fg} />
      <Text style={[styles.actionPillText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

const TONE = {
  neutral: { wrap: { backgroundColor: '#fff', borderColor: theme.colors.border }, fg: theme.colors.ink },
  brand: { wrap: { backgroundColor: theme.colors.brand50, borderColor: theme.colors.brand200 }, fg: theme.colors.brand600 },
  danger: { wrap: { backgroundColor: '#fff', borderColor: theme.colors.border }, fg: '#dc2626' },
};

function SubscribeButton({ rel, busy, onSubscribe, onUnsubscribe }) {
  if (rel.isFollower) {
    return (
      <Pressable
        onPress={onUnsubscribe}
        disabled={busy}
        style={[styles.actionPill, { backgroundColor: '#fff', borderColor: theme.colors.border }]}
      >
        <Feather name="check" size={14} color={theme.colors.brand600} strokeWidth={3} />
        <Text style={[styles.actionPillText, { color: theme.colors.brand600 }]}>Subscribed</Text>
      </Pressable>
    );
  }
  if (rel.hasPendingRequest) {
    return (
      <View style={[styles.actionPill, { backgroundColor: theme.colors.brand50, borderColor: theme.colors.brand200 }]}>
        <Feather name="clock" size={14} color={theme.colors.brand600} />
        <Text style={[styles.actionPillText, { color: theme.colors.brand600 }]}>Request sent</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onSubscribe}
      disabled={busy}
      style={[styles.actionPill, { backgroundColor: theme.colors.tinder, borderColor: theme.colors.tinder }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Feather name="user-plus" size={14} color="#fff" />
      )}
      <Text style={[styles.actionPillText, { color: '#fff' }]}>Subscribe</Text>
    </Pressable>
  );
}

function ReferralCard({ me }) {
  return (
    <View style={styles.referralCard}>
      <Text style={styles.referralEyebrow}>REFER & EARN</Text>
      <View style={styles.referralCodeRow}>
        <Text style={styles.referralCode}>{me.referralCode}</Text>
        <Pressable onPress={() => Alert.alert('Code copied (visual only)', me.referralCode)} style={styles.referralCopy}>
          <Feather name="copy" size={12} color={theme.colors.brand700} />
          <Text style={styles.referralCopyText}>Copy</Text>
        </Pressable>
      </View>
      <View style={styles.referralStats}>
        <ReferralStat label="Friends" value={me.referralCount || 0} />
        <ReferralStat label="Earned" value={`₹${fmtCredits(me.referralEarnings || 0)}`} />
        <ReferralStat label="Wallet" value={`₹${fmtCredits(me.referralWalletBalance || 0)}`} />
      </View>
    </View>
  );
}

function ReferralStat({ label, value }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={styles.refValue}>{value}</Text>
      <Text style={styles.refLabel}>{label}</Text>
    </View>
  );
}

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function comingSoon(label) {
  Alert.alert(`${label} — coming to mobile soon`, 'Use the web for now: callnade.site');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  muted: { color: theme.colors.muted },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10 },
  backText: { color: theme.colors.muted, fontSize: 14 },

  header: { flexDirection: 'row', padding: 16, alignItems: 'flex-start' },
  avatarWrap: { position: 'relative' },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.colors.border },
  avatarFallback: {
    backgroundColor: theme.colors.tinder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: '#fff', fontSize: 30, fontWeight: '600' },
  dotOnAvatar: { position: 'absolute', right: -2, bottom: -2, padding: 0 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 22, fontWeight: '800', color: theme.colors.ink },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.tinder,
  },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  handle: { color: theme.colors.muted, marginTop: 2 },
  bio: { color: theme.colors.ink, marginTop: 8, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 16, marginTop: 10 },
  statText: { fontSize: 13 },
  statNum: { fontWeight: '800', color: theme.colors.ink },
  statLabel: { color: theme.colors.muted },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  privateText: { color: theme.colors.muted, fontSize: 11 },

  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
  },
  actionPillText: { fontWeight: '600', fontSize: 13 },

  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  galleryTile: { width: '33.33%', padding: 4 },
  galleryImg: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
  },
  galleryLocked: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fde2ea',
  },
  lockedHint: {
    paddingHorizontal: 24,
    paddingTop: 8,
    color: theme.colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },

  referralCard: {
    margin: 16,
    padding: 16,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.brand50,
    borderWidth: 1,
    borderColor: theme.colors.brand200,
  },
  referralEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: theme.colors.brand600,
  },
  referralCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  referralCode: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.ink,
    letterSpacing: 1.2,
  },
  referralCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: theme.radius.pill,
  },
  referralCopyText: { color: theme.colors.brand700, fontWeight: '700', fontSize: 11 },
  referralStats: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.brand200,
  },
  refValue: { fontSize: 16, fontWeight: '800', color: theme.colors.ink },
  refLabel: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },

  stickyCta: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    gap: 10,
  },
  stickyBtn: {
    flex: 1,
    height: 50,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  audioBtn: { backgroundColor: theme.colors.brand200 },
  videoBtn: {
    backgroundColor: theme.colors.tinder,
    shadowColor: theme.colors.tinder,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  stickyBtnText: { fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.55 },
});
