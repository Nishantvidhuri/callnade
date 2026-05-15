import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';
import { theme } from '../theme.js';

/**
 * Package picker — direct port of the web's PackagePickerModal.
 *
 * Flow:
 *   1. Mounts with `peer = { username }` and an optional callType
 *      filter (`audio` | `video` | null = both).
 *   2. Fetches `/users/{username}` once on open to pull the creator's
 *      packages (the web caches the profile so this is fast).
 *   3. Renders a list of cards. Each row shows title, type chip,
 *      total price, duration, and per-minute rate. The per-minute
 *      rate is what the backend uses as the affordability gate
 *      (caller only needs one minute's credits to start).
 *   4. Affordability:
 *      - Per-package: tapping is blocked when `balance < perMin`,
 *        and a "Need X/min" badge appears in the row.
 *      - Modal-level: when the cheapest paid package is unaffordable,
 *        an amber banner sits at the top with a Recharge pill.
 *   5. Recharge in the footer routes to /billing on tap.
 *
 * Props:
 *   visible        — open/close.
 *   peer           — { username, displayName?, id? } the user being called.
 *   callTypeFilter — 'audio' | 'video' | null
 *   onClose        — close handler.
 *   onPick         — fires when the viewer picks a package and has
 *                    enough balance. Signature: ({ packageId, callType }).
 *                    Modal closes itself before firing.
 *   onRecharge     — invoked when the user taps any recharge CTA;
 *                    parent navigates to the Billing screen.
 */
export default function PackagePickerModal({
  visible,
  peer,
  callTypeFilter,
  onClose,
  onPick,
  onRecharge,
}) {
  const me = useAuthStore((s) => s.user);
  const balance = me?.walletBalance ?? 0;

  const [allPackages, setAllPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || !peer?.username) return;
    setLoading(true);
    setError(null);
    api
      .get(`/users/${peer.username}`)
      .then((r) => setAllPackages(r.data?.packages || []))
      .catch((e) => setError(e.message || 'Failed to load packages'))
      .finally(() => setLoading(false));
  }, [visible, peer?.username]);

  const packages = useMemo(
    () =>
      callTypeFilter
        ? allPackages.filter((p) => (p.callType || 'video') === callTypeFilter)
        : allPackages,
    [allPackages, callTypeFilter],
  );

  // Per-minute rate for affordability check (matches the backend gate
  // in call.handlers.js). Falls back to full price for legacy packages
  // missing a duration.
  const perMinFor = (p) =>
    p.durationMinutes && p.durationMinutes > 0 ? p.price / p.durationMinutes : p.price;

  const paid = packages.filter((p) => (p.price ?? 0) > 0);
  const cheapest = paid.length
    ? paid.reduce((min, p) => (perMinFor(p) < perMinFor(min) ? p : min))
    : null;
  const cheapestPerMin = cheapest ? perMinFor(cheapest) : 0;
  const cantAffordAny = !!cheapest && balance < cheapestPerMin;

  const pick = (p) => {
    onPick?.({ packageId: p.id, callType: p.callType || 'video' });
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.head}>
            <View style={styles.headLeft}>
              {callTypeFilter && (
                <View style={[styles.headIcon, callTypeFilter === 'audio' ? styles.headIconAudio : styles.headIconVideo]}>
                  <Feather name={callTypeFilter === 'audio' ? 'phone' : 'video'} size={16} color="#fff" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>
                  {callTypeFilter === 'audio'
                    ? 'Pick an audio call package'
                    : callTypeFilter === 'video'
                      ? 'Pick a video call package'
                      : 'Start a call with'}
                </Text>
                <Text style={styles.headTitle} numberOfLines={1}>
                  @{peer?.username}
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={6} style={styles.closeBtn}>
              <Feather name="x" size={18} color={theme.colors.muted} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
            {!loading && !error && cantAffordAny && (
              <View style={styles.banner}>
                <View style={styles.bannerHead}>
                  <View style={styles.bannerIcon}>
                    <Feather name="alert-circle" size={16} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bannerTitle}>
                      Recharge to connect — your balance is low.
                    </Text>
                    <Text style={styles.bannerBody}>
                      Even the cheapest creator costs ₹{fmtCredits(cheapestPerMin)}/min and
                      you only have ₹{fmtCredits(balance)} in your wallet — top up to
                      connect.
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => { onRecharge?.(); onClose?.(); }}
                  style={styles.bannerCta}
                >
                  <Feather name="credit-card" size={14} color="#fff" />
                  <Text style={styles.bannerCtaText}>Recharge wallet</Text>
                </Pressable>
              </View>
            )}

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={theme.colors.tinder} />
                <Text style={styles.muted}>Loading packages…</Text>
              </View>
            ) : error ? (
              <Text style={[styles.muted, { color: theme.colors.danger, textAlign: 'center', paddingVertical: 18 }]}>
                {error}
              </Text>
            ) : packages.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.muted}>
                  {callTypeFilter
                    ? `No ${callTypeFilter} packages yet.`
                    : 'No packages yet.'}
                </Text>
                <Pressable
                  onPress={() => pick({ id: null, callType: callTypeFilter || 'video' })}
                  style={styles.freeCta}
                >
                  <Feather name={callTypeFilter === 'audio' ? 'phone' : 'video'} size={14} color="#fff" />
                  <Text style={styles.freeCtaText}>
                    Start free {callTypeFilter || 'video'} call
                  </Text>
                </Pressable>
              </View>
            ) : (
              packages.map((p) => {
                const perMin = p.durationMinutes ? p.price / p.durationMinutes : null;
                const minCharge = perMin ?? p.price;
                const insufficient = balance < minCharge;
                const isAudio = p.callType === 'audio';
                return (
                  <View key={p.id} style={styles.pkg}>
                    <View style={styles.pkgHead}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.pkgTitleRow}>
                          <Text style={styles.pkgTitle} numberOfLines={1}>{p.title}</Text>
                          <View style={[styles.typeChip, isAudio ? styles.typeChipAudio : styles.typeChipVideo]}>
                            <Feather
                              name={isAudio ? 'phone' : 'video'}
                              size={9}
                              color={isAudio ? '#0369a1' : theme.colors.brand600}
                            />
                            <Text style={[styles.typeChipText, { color: isAudio ? '#0369a1' : theme.colors.brand600 }]}>
                              {isAudio ? 'Audio' : 'Video'}
                            </Text>
                          </View>
                        </View>
                        {p.description ? (
                          <Text style={styles.pkgDesc} numberOfLines={2}>{p.description}</Text>
                        ) : null}
                      </View>
                      <View style={styles.pkgPriceWrap}>
                        <Text style={styles.pkgPrice}>{p.price}</Text>
                        {p.durationMinutes != null ? (
                          <Text style={styles.pkgDuration}>{p.durationMinutes} min</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.pkgFoot}>
                      <Text style={styles.muted}>
                        {perMin != null ? `≈ ${perMin.toFixed(1)} credits/min` : 'flat fee'}
                      </Text>
                      {insufficient ? (
                        <View style={styles.needPill}>
                          <Feather name="alert-circle" size={11} color="#dc2626" />
                          <Text style={styles.needText}>
                            Need {fmtCredits(minCharge)}{perMin != null ? '/min' : ''}
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => pick(p)}
                          style={[styles.startBtn, isAudio ? styles.startBtnAudio : styles.startBtnVideo]}
                        >
                          <Feather name={isAudio ? 'phone' : 'video'} size={12} color="#fff" />
                          <Text style={styles.startBtnText}>Start</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer — balance + recharge pill */}
          <View style={styles.foot}>
            <View style={styles.footLeft}>
              <Text style={styles.muted}>Your balance</Text>
              <View style={styles.balancePill}>
                <Feather name="credit-card" size={11} color="#047857" />
                <Text style={styles.balanceText}>{fmtCredits(balance)}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => { onRecharge?.(); onClose?.(); }}
              style={styles.rechargeBtn}
            >
              <Feather name="credit-card" size={12} color="#fff" />
              <Text style={styles.rechargeText}>Recharge</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
  },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  headIconVideo: { backgroundColor: theme.colors.tinder },
  headIconAudio: { backgroundColor: '#0ea5e9' },
  eyebrow: { color: theme.colors.muted, fontSize: 12 },
  headTitle: { color: theme.colors.ink, fontWeight: '800', fontSize: 16 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },

  banner: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: 14,
    gap: 10,
  },
  bannerHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bannerIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f59e0b', marginTop: 2,
  },
  bannerTitle: { color: '#78350f', fontWeight: '800', fontSize: 14 },
  bannerBody: { color: '#78350f', fontSize: 12.5, marginTop: 2, lineHeight: 18 },
  bannerCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.colors.tinder, borderRadius: theme.radius.pill,
    paddingVertical: 12,
  },
  bannerCtaText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  pkg: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#fff',
    padding: 14,
  },
  pkgHead: { flexDirection: 'row', gap: 10 },
  pkgTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pkgTitle: { fontWeight: '700', color: theme.colors.ink, fontSize: 14 },
  pkgDesc: { color: theme.colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  pkgPriceWrap: { alignItems: 'flex-end' },
  pkgPrice: { color: '#047857', fontWeight: '800', fontSize: 18 },
  pkgDuration: { color: theme.colors.muted, fontSize: 11 },
  pkgFoot: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  typeChipAudio: { backgroundColor: '#e0f2fe' },
  typeChipVideo: { backgroundColor: theme.colors.brand100 },
  typeChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  needPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: '#fee2e2', borderRadius: theme.radius.pill,
  },
  needText: { color: '#dc2626', fontWeight: '700', fontSize: 11 },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: theme.radius.pill,
  },
  startBtnVideo: { backgroundColor: theme.colors.tinder },
  startBtnAudio: { backgroundColor: '#0ea5e9' },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  center: { padding: 28, alignItems: 'center', gap: 12 },
  muted: { color: theme.colors.muted, fontSize: 12 },

  freeCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.tinder,
  },
  freeCtaText: { color: '#fff', fontWeight: '700' },

  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: '#ecfdf5', borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: '#a7f3d0',
  },
  balanceText: { color: '#047857', fontWeight: '800', fontSize: 12, fontFamily: 'monospace' },
  rechargeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: theme.colors.tinder, borderRadius: theme.radius.pill,
  },
  rechargeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
