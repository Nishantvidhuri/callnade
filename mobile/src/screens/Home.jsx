import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api.js';
import UserCard from '../components/UserCard.jsx';
import TopBar from '../components/TopBar.jsx';
import { theme } from '../theme.js';

/**
 * Home / Discovery — 1:1 mirror of frontend/src/pages/Home.jsx.
 *
 * Two sections rendered as a single FlatList:
 *   1. "Online now"  with the 🔥 emoji, hidden when nobody's online.
 *   2. "Popular"     with the ✨ emoji, infinite-scrolling via the
 *      `nextCursor` returned by /popular.
 *
 * Search filters the popular grid live (no URL plumbing on mobile —
 * the TopBar pipes the query straight into state). A trailing
 * "That's everyone — you've seen them all" line appears once the
 * cursor is exhausted, matching the web's UX.
 */
export default function Home() {
  const [items, setItems] = useState([]);
  const [online, setOnline] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((u) => {
      const dn = (u.displayName || '').toLowerCase();
      const un = (u.username || '').toLowerCase();
      return dn.includes(q) || un.includes(q);
    });
  }, [items, query]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pop, on] = await Promise.all([
        api.get('/popular', { params: { limit: 30 } }),
        api.get('/users/online', { params: { adult: 'false' } }),
      ]);
      setItems(pop.data?.items || []);
      setCursor(pop.data?.nextCursor || null);
      setOnline(on.data?.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  // Pull the next page when the user scrolls near the bottom. Skipped
  // while a search query is active — search is local-only, no point
  // hitting the server for more.
  const onEndReached = async () => {
    if (loadingMore || !cursor || query) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get('/popular', { params: { limit: 30, cursor } });
      setItems((prev) => [...prev, ...(data?.items || [])]);
      setCursor(data?.nextCursor || null);
    } catch {
      /* pull-to-refresh to retry */
    } finally {
      setLoadingMore(false);
    }
  };

  // Build the feed: optional "Online now" header + 2-column rows,
  // then "Popular" header + 2-column rows. Section headers and rows
  // are mixed in one FlatList — we pair the items manually instead
  // of using `numColumns` so the section headers can sit in between.
  const feed = useMemo(() => {
    const rows = [];
    if (online.length > 0 && !query) {
      rows.push({ type: 'header', id: 'h-online', title: 'Online now', emoji: '🔥' });
      for (let i = 0; i < online.length; i += 2) {
        rows.push({ type: 'row', id: `o-row-${i}`, items: [online[i], online[i + 1]].filter(Boolean) });
      }
    }
    rows.push({ type: 'header', id: 'h-popular', title: 'Popular', emoji: '✨' });
    for (let i = 0; i < filtered.length; i += 2) {
      rows.push({ type: 'row', id: `p-row-${i}`, items: [filtered[i], filtered[i + 1]].filter(Boolean) });
    }
    return rows;
  }, [online, filtered, query]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar onQueryChange={setQuery} />

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.tinder} />
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(row) => row.id}
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <SectionHeader title={item.title} emoji={item.emoji} />
            ) : (
              <View style={styles.row}>
                {item.items.map((u) => (
                  <View key={String(u.id)} style={styles.cell}>
                    <UserCard user={u} />
                  </View>
                ))}
                {item.items.length === 1 ? <View style={styles.cell} /> : null}
              </View>
            )
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 28 }}
          ListFooterComponent={
            query
              ? null
              : loadingMore
                ? <View style={styles.center}><ActivityIndicator color={theme.colors.tinder} /></View>
                : cursor
                  ? null
                  : items.length > 0
                    ? <Text style={styles.footerText}>That’s everyone — you’ve seen them all.</Text>
                    : null
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.center}>
                <Text style={styles.muted}>
                  {query ? `No results for “${query}”` : 'No creators yet.'}
                </Text>
              </View>
            ) : null
          }
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tinder} />
          }
        />
      )}
    </SafeAreaView>
  );
}

function SectionHeader({ title, emoji }) {
  return (
    <Text style={styles.sectionHeader}>
      {title}
      {emoji ? <Text style={styles.sectionEmoji}>  {emoji}</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { padding: 40, alignItems: 'center' },
  muted: { color: theme.colors.muted },

  errorBar: {
    marginHorizontal: 14,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#fef2f2',
    borderRadius: theme.radius.lg,
    borderColor: '#fecaca',
    borderWidth: 1,
  },
  errorText: { color: '#dc2626', fontSize: 13 },

  sectionHeader: {
    fontSize: 19,
    fontWeight: '800',
    color: theme.colors.ink,
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionEmoji: { fontSize: 18 },

  row: { flexDirection: 'row' },
  cell: { flex: 1 },

  footerText: {
    textAlign: 'center',
    color: theme.colors.mutedSoft,
    fontSize: 11,
    marginTop: 14,
  },
});
