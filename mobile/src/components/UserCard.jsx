import { Image, Pressable, Text, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import PresenceDot from './PresenceDot.jsx';
import { theme } from '../theme.js';

/**
 * Creator card on the home grid. Tap → navigate to Profile.
 * Renders the same status pill (LIVE / BUSY / OFFLINE) as the web,
 * baked off the `presence` field on the API payload.
 */
export default function UserCard({ user }) {
  const nav = useNavigation();
  const status = user.presence || (user.online ? 'online' : 'offline');
  const pill = STATUS_PILL[status] || STATUS_PILL.offline;

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

      {/* Name + handle — bottom */}
      <View style={styles.foot}>
        <Text style={styles.name} numberOfLines={1}>
          {user.displayName || user.username}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{user.username}
        </Text>
      </View>
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
});
