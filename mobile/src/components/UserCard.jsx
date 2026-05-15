import { useState } from 'react';
import { Image, Pressable, Text, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth.store.js';
import PresenceDot from './PresenceDot.jsx';
import PackagePickerModal from './PackagePickerModal.jsx';
import { theme } from '../theme.js';

/**
 * Creator card on the home grid.
 *
 *   - Tap anywhere on the card → push the creator's Profile.
 *   - Tap the bottom-right pink video button → push the Call screen
 *     with `callType: 'video'`. Mirrors the web's "corner notch"
 *     button (rounded only on the opposite corners so it nests
 *     flush in the card's bottom-right). Disabled when the creator
 *     is busy and hidden entirely on your own card.
 */
export default function UserCard({ user }) {
  const nav = useNavigation();
  const me = useAuthStore((s) => s.user);
  const status = user.presence || (user.online ? 'online' : 'offline');
  const pill = STATUS_PILL[status] || STATUS_PILL.offline;
  const isSelf = me && String(me._id || me.id) === String(user.id);
  const callDisabled = status === 'busy' || isSelf;
  const [pickerOpen, setPickerOpen] = useState(false);

  const onCallPress = (e) => {
    // Stop the tap from also triggering the surrounding Pressable
    // (which would push the Profile instead of opening the picker).
    e?.stopPropagation?.();
    if (callDisabled) return;
    setPickerOpen(true);
  };

  const onPick = ({ packageId, callType }) => {
    nav.navigate('Call', {
      peerId: user._id || user.id,
      peerLabel: user.displayName || user.username,
      callType: callType || 'video',
      packageId,
    });
  };

  return (
    <Pressable
      onPress={() => nav.navigate('Profile', { username: user.username })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarFallbackText}>
            {(user.displayName || user.username || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.gradient} pointerEvents="none" />

      {/* Status pill — top-right */}
      <View style={[styles.pill, { backgroundColor: pill.bg }]}>
        <View style={[styles.pillDot, { backgroundColor: pill.dot }]} />
        <Text style={styles.pillText}>{pill.label}</Text>
      </View>

      {/* Name + handle — bottom-left. Pushed inwards from the right
          so the call button below doesn't sit on top of long names. */}
      <View style={[styles.foot, !isSelf && { right: 48 }]}>
        <Text style={styles.name} numberOfLines={1}>
          {user.displayName || user.username}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{user.username}
        </Text>
      </View>

      {/* Video call button — bottom-right corner, flush. */}
      {!isSelf && (
        <Pressable
          onPress={onCallPress}
          disabled={callDisabled}
          hitSlop={4}
          style={({ pressed }) => [
            styles.callBtn,
            callDisabled ? styles.callBtnDisabled : styles.callBtnEnabled,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Feather name="video" size={17} color="#fff" strokeWidth={2.2} />
        </Pressable>
      )}

      {/* Package picker modal — renders flat inside the card's
          Pressable but the Modal itself paints in an overlay layer
          above it, so the card press underneath doesn't fire while
          the picker is up. */}
      <PackagePickerModal
        visible={pickerOpen}
        peer={user}
        callTypeFilter="video"
        onClose={() => setPickerOpen(false)}
        onPick={onPick}
        onRecharge={() => nav.navigate('Billing')}
      />
    </Pressable>
  );
}

const STATUS_PILL = {
  online: { bg: '#e11d48', dot: '#fff', label: 'LIVE' },
  busy: { bg: theme.colors.danger, dot: '#fff', label: 'BUSY' },
  offline: { bg: 'rgba(115,115,115,0.9)', dot: '#fff', label: 'OFFLINE' },
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.border,
    margin: 4,
  },
  avatar: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  avatarFallback: {
    backgroundColor: theme.colors.tinder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { color: '#fff', fontSize: 36, fontWeight: '500' },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pill: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  pillText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  foot: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  name: { color: '#fff', fontWeight: '600', fontSize: 14 },
  handle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 1 },

  // Bottom-right call button — flush against the card corner. Only
  // the opposite corners (top-left + bottom-right) are rounded so it
  // tucks into the card's own border-radius without floating away.
  callBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopLeftRadius: theme.radius.lg,
    borderBottomRightRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  callBtnEnabled: { backgroundColor: theme.colors.tinder },
  callBtnDisabled: { backgroundColor: 'rgba(115,115,115,0.85)' },
});
