import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api.js';
import { theme } from '../theme.js';

/**
 * Notifications tab — pulls /notifications from the same REST
 * endpoint the web uses. Once the socket sync hook is ported this
 * list will live-update; for now a pull-to-refresh covers it.
 */
export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications');
      setItems(data?.items || []);
    } catch {
      /* show empty */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Alerts</Text>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.tinder} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.id || it._id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowText} numberOfLines={3}>
                {item.text || item.message || 'New notification'}
              </Text>
              {item.createdAt && (
                <Text style={styles.rowTime}>{new Date(item.createdAt).toLocaleString()}</Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔔</Text>
              <Text style={styles.emptyHead}>You're all caught up</Text>
              <Text style={styles.emptyBody}>
                Subscriber requests, package payouts, and platform alerts will
                show up here.
              </Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.ink, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    backgroundColor: '#fff',
    marginHorizontal: 14,
    marginVertical: 6,
    padding: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowText: { color: theme.colors.ink, fontSize: 14, lineHeight: 19 },
  rowTime: { color: theme.colors.muted, fontSize: 11, marginTop: 6 },
  empty: { padding: 40, alignItems: 'center', gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyHead: { fontSize: 16, fontWeight: '700', color: theme.colors.ink },
  emptyBody: { fontSize: 13, color: theme.colors.muted, textAlign: 'center', lineHeight: 19 },
});
