import { useMemo } from 'react';
import {
  FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useIncomingCallsStore } from '../stores/incomingCalls.store.js';
import { getSocket } from '../services/socket.js';
import { theme } from '../theme.js';

/**
 * Calls tab — the creator's ring inbox. Pulls live entries from the
 * incoming-calls store (kept in sync by useIncomingCalls at the App
 * level). Tap Accept on a row → emit `call:accept` and navigate to
 * the IncomingCall screen, which does the answerer-side WebRTC.
 * Tap Reject → emit `call:reject`, the entry drops out of the list.
 *
 * Direct port of frontend/src/pages/Calls.jsx (the creator's
 * "Video calls" page on the web).
 */
export default function Calls({ navigation }) {
  const items = useIncomingCallsStore((s) => s.items);
  const remove = useIncomingCallsStore((s) => s.remove);

  // Sort newest first — store already prepends, but a re-render can
  // briefly show stale order during dedupe; defensive sort here.
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        new Date(b.at).getTime() - new Date(a.at).getTime(),
      ),
    [items],
  );

  const accept = (item) => {
    const socket = getSocket();
    socket.emit('call:accept', { callId: item.callId }, (ack) => {
      if (ack?.error) {
        // Caller probably hung up between the ring and our accept.
        // Drop the row and let the user pick a fresher invite.
        remove(item.callId);
        return;
      }
      navigation.navigate('IncomingCall', {
        callId: item.callId,
        callType: item.callType || 'video',
        callerLabel: item.from?.displayName || item.from?.username || 'Caller',
        earnRate: item.earnRate,
        billRate: item.perMinuteRate,
        callerBalance: item.callerBalance,
      });
    });
  };

  const reject = (item) => {
    const socket = getSocket();
    socket.emit('call:reject', { callId: item.callId });
    remove(item.callId);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Calls</Text>
      <Text style={styles.subtitle}>Incoming requests show up here in real time.</Text>

      <FlatList
        data={sorted}
        keyExtractor={(it) => String(it.callId)}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 30 }}
        renderItem={({ item }) => (
          <RingingRow item={item} onAccept={() => accept(item)} onReject={() => reject(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="phone-incoming" size={26} color={theme.colors.mutedSoft} />
            </View>
            <Text style={styles.emptyHead}>No incoming calls</Text>
            <Text style={styles.emptyBody}>
              When a subscriber rings you, the call will pop up here in real
              time. Tap Accept to answer.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function RingingRow({ item, onAccept, onReject }) {
  const callerName = item.from?.displayName || item.from?.username || 'Caller';
  const handle = item.from?.username ? `@${item.from.username}` : '';
  const isAudio = item.callType === 'audio';
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={styles.callIcon}>
          <Feather
            name={isAudio ? 'phone-incoming' : 'video'}
            size={20}
            color="#fff"
          />
          <View style={styles.ringDot} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>{callerName}</Text>
            <View style={styles.ringingPill}>
              <View style={styles.ringingDot} />
              <Text style={styles.ringingText}>RINGING</Text>
            </View>
          </View>
          {handle ? <Text style={styles.handle}>{handle}</Text> : null}
          <Text style={styles.kind}>{isAudio ? 'Audio call' : 'Video call'}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onReject} style={[styles.actionBtn, styles.rejectBtn]}>
          <Feather name="phone-off" size={16} color="#fff" />
          <Text style={styles.actionText}>Decline</Text>
        </Pressable>
        <Pressable onPress={onAccept} style={[styles.actionBtn, styles.acceptBtn]}>
          <Feather name="phone" size={16} color="#fff" />
          <Text style={styles.actionText}>Accept</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.ink, paddingHorizontal: 18, paddingTop: 8 },
  subtitle: { fontSize: 13, color: theme.colors.muted, paddingHorizontal: 18, paddingTop: 2, paddingBottom: 6 },

  row: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.xl,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: 14,
    gap: 12,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  callIcon: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: theme.colors.tinder,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  ringDot: {
    position: 'absolute', top: 4, right: 4,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 2, borderColor: '#fff',
  },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: theme.colors.ink, fontWeight: '800', fontSize: 16, flex: 1 },
  ringingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: theme.colors.tinder, borderRadius: theme.radius.pill,
  },
  ringingDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  ringingText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  handle: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  kind: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },

  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
  },
  rejectBtn: { backgroundColor: '#525252' },
  acceptBtn: { backgroundColor: '#16a34a' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  empty: { padding: 40, alignItems: 'center', gap: 8 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyHead: { color: theme.colors.ink, fontWeight: '800', fontSize: 16, marginTop: 6 },
  emptyBody: { color: theme.colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
});
