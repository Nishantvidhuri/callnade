import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api } from '../services/api.js';
import { theme } from '../theme.js';

/**
 * Admin → Visits. Read-only list of recent route visits — username,
 * path, IP, timestamp. Hits the same `/visits` endpoint the web
 * admin uses. Infinite scroll via the `nextCursor` returned by the
 * backend.
 */
export default function AdminVisits({ navigation }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (nextCursor) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/visits', {
        params: { cursor: nextCursor || undefined },
      });
      setItems((prev) => (nextCursor ? [...prev, ...data.items] : data.items || []));
      setCursor(data.nextCursor || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(null); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(null); };
  const onEnd = () => { if (cursor && !loading) load(cursor); };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={6}>
          <Feather name="arrow-left" size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.title}>Visits</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(v, i) => String(v.id || v._id || `${v.path}-${v.createdAt}-${i}`)}
        contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 30 }}
        renderItem={({ item }) => <VisitRow visit={item} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator color={theme.colors.tinder} /></View>
          ) : (
            <View style={styles.empty}><Text style={{ color: theme.colors.muted }}>No visits logged yet.</Text></View>
          )
        }
        onEndReachedThreshold={0.4}
        onEndReached={onEnd}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tinder} />
        }
      />
    </SafeAreaView>
  );
}

function VisitRow({ visit }) {
  const who = visit.user?.displayName || visit.user?.username || (visit.anonymous ? 'Anonymous' : 'Visitor');
  const handle = visit.user?.username ? `@${visit.user.username}` : '';
  const when = visit.createdAt ? new Date(visit.createdAt).toLocaleString() : '';
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: visit.user ? theme.colors.success : theme.colors.mutedSoft }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.path} numberOfLines={1}>{visit.path || '/'}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {who}{handle ? ` · ${handle}` : ''}{visit.ip ? `  ·  ${visit.ip}` : ''}
        </Text>
        {when ? <Text style={styles.time}>{when}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.ink, flex: 1 },
  error: { color: theme.colors.danger, paddingHorizontal: 14 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  path: { fontFamily: 'monospace', fontSize: 13, fontWeight: '600', color: theme.colors.ink },
  meta: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  time: { color: theme.colors.mutedSoft, fontSize: 11, marginTop: 2 },
  empty: { padding: 30, alignItems: 'center' },
});
