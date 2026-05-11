import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import UserCard from '../components/UserCard.jsx';
import { theme } from '../theme.js';

/**
 * Discovery feed. Pulls /popular for the main grid; an "Online now"
 * row sits at the top via /users/online. Two-column grid mirrors
 * the web's home layout but in pure FlatList for native scroll
 * performance.
 */
export default function Home() {
  const me = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const [items, setItems] = useState([]);
  const [online, setOnline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pop, on] = await Promise.all([
        api.get('/popular', { params: { limit: 30 } }),
        api.get('/users/online', { params: { adult: 'false' } }),
      ]);
      setItems(pop.data?.items || []);
      setOnline(on.data?.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>callnade</Text>
        <Pressable onPress={() => clearAuth()} hitSlop={12}>
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.tinder} />
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(it) => String(it.id)}
          renderItem={({ item }) => <UserCard user={item} />}
          columnWrapperStyle={{ paddingHorizontal: 8 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListHeaderComponent={
            <>
              {me && (
                <Text style={styles.greeting}>
                  Hi, {me.displayName || me.username} 👋
                </Text>
              )}
              {!!online.length && (
                <View style={styles.onlineWrap}>
                  <Text style={styles.sectionLabel}>Online now</Text>
                  <FlatList
                    horizontal
                    data={online}
                    keyExtractor={(it) => `o-${it.id}`}
                    renderItem={({ item }) => (
                      <View style={{ width: 140, marginRight: 6 }}>
                        <UserCard user={item} />
                      </View>
                    )}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 8 }}
                  />
                </View>
              )}
              <Text style={styles.sectionLabel}>Popular</Text>
            </>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.muted}>No creators yet.</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tinder} />
          }
        />
      )}

      {error && <Text style={[styles.muted, { padding: 16, color: theme.colors.danger }]}>{error}</Text>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  brand: { fontSize: 20, fontWeight: '800', color: theme.colors.tinder },
  logout: { color: theme.colors.muted, fontSize: 13, fontWeight: '600' },
  center: { padding: 40, alignItems: 'center' },
  muted: { color: theme.colors.muted },
  greeting: { paddingHorizontal: 16, paddingTop: 4, fontSize: 16, color: theme.colors.ink, fontWeight: '600' },
  onlineWrap: { marginTop: 14 },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
