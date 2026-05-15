import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api } from '../services/api.js';
import { theme } from '../theme.js';

/**
 * Admin → Payment QRs. The rotation pool shown to users on the
 * top-up page (one is picked at random per session). Mobile build
 * supports listing, toggling active/inactive, and deleting. Image
 * upload is deferred — needs `expo-image-picker` + multipart
 * upload (Phase 4 wallet work).
 */
export default function AdminPaymentQrs({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/payment-qrs');
      setItems(data?.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const toggleActive = async (qr) => {
    setBusy(qr.id);
    try {
      await api.patch(`/admin/payment-qrs/${qr.id}`, { active: !qr.active });
      setItems((prev) => prev.map((q) => (q.id === qr.id ? { ...q, active: !q.active } : q)));
    } catch (e) {
      Alert.alert('Update failed', e.message);
    } finally { setBusy(null); }
  };

  const remove = (qr) =>
    Alert.alert(
      'Delete QR',
      `Remove this QR (${qr.label || qr.id}) from the pool?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(qr.id);
            try {
              await api.delete(`/admin/payment-qrs/${qr.id}`);
              setItems((prev) => prev.filter((q) => q.id !== qr.id));
            } catch (e) {
              Alert.alert('Delete failed', e.message);
            } finally { setBusy(null); }
          },
        },
      ],
    );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={6}>
          <Feather name="arrow-left" size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.title}>Payment QRs</Text>
        <Pressable
          onPress={() => Alert.alert('Upload from web', 'Image-pick + multipart upload lands in the next mobile update. Use the web admin for now.')}
          style={styles.uploadBtn}
        >
          <Feather name="upload" size={14} color="#fff" />
          <Text style={styles.uploadBtnText}>Upload</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(q) => String(q.id || q._id)}
        numColumns={2}
        columnWrapperStyle={{ paddingHorizontal: 10 }}
        contentContainerStyle={{ paddingVertical: 8, gap: 8 }}
        renderItem={({ item }) => (
          <QrTile
            qr={item}
            busy={busy === item.id}
            onToggle={() => toggleActive(item)}
            onDelete={() => remove(item)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}><ActivityIndicator color={theme.colors.tinder} /></View>
          ) : (
            <View style={styles.empty}><Text style={{ color: theme.colors.muted }}>No QRs in the pool yet.</Text></View>
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tinder} />
        }
      />
    </SafeAreaView>
  );
}

function QrTile({ qr, busy, onToggle, onDelete }) {
  return (
    <View style={styles.tile}>
      <View style={styles.imgWrap}>
        {qr.url ? (
          <Image source={{ uri: qr.url }} style={styles.img} resizeMode="contain" />
        ) : (
          <View style={[styles.img, { alignItems: 'center', justifyContent: 'center' }]}>
            <Feather name="image" size={28} color={theme.colors.mutedSoft} />
          </View>
        )}
        <View style={[styles.statusPill, qr.active ? styles.activePill : styles.pausedPill]}>
          <View style={[styles.statusDot, { backgroundColor: qr.active ? '#22c55e' : '#9ca3af' }]} />
          <Text style={styles.statusText}>{qr.active ? 'Active' : 'Paused'}</Text>
        </View>
      </View>

      <View style={{ padding: 10 }}>
        <Text style={styles.tileTitle} numberOfLines={1}>{qr.label || '—'}</Text>
        {qr.upiId ? <Text style={styles.tileMeta} numberOfLines={1}>{qr.upiId}</Text> : null}
      </View>

      <View style={styles.actions}>
        {busy ? (
          <ActivityIndicator color={theme.colors.tinder} />
        ) : (
          <>
            <Pressable
              onPress={onToggle}
              style={[styles.actionBtn, { backgroundColor: qr.active ? '#f5f5f5' : '#dcfce7' }]}
            >
              <Feather
                name={qr.active ? 'pause' : 'play'}
                size={12}
                color={qr.active ? theme.colors.ink : '#15803d'}
              />
              <Text style={[styles.actionBtnText, { color: qr.active ? theme.colors.ink : '#15803d' }]}>
                {qr.active ? 'Pause' : 'Enable'}
              </Text>
            </Pressable>
            <Pressable onPress={onDelete} style={[styles.actionBtn, { backgroundColor: '#fee2e2' }]}>
              <Feather name="trash-2" size={12} color="#dc2626" />
              <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>Delete</Text>
            </Pressable>
          </>
        )}
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
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: theme.colors.tinder, borderRadius: theme.radius.pill,
  },
  uploadBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  error: { color: theme.colors.danger, paddingHorizontal: 14 },

  tile: {
    flex: 1, margin: 4,
    borderRadius: theme.radius.lg,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  imgWrap: { backgroundColor: '#f5f5f5', aspectRatio: 1, position: 'relative' },
  img: { width: '100%', height: '100%' },
  statusPill: {
    position: 'absolute', top: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  activePill: { backgroundColor: '#dcfce7' },
  pausedPill: { backgroundColor: '#f5f5f5' },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  tileTitle: { fontWeight: '700', color: theme.colors.ink },
  tileMeta: { fontSize: 11, color: theme.colors.muted, marginTop: 2 },
  actions: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingBottom: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  actionBtnText: { fontSize: 11, fontWeight: '700' },
  empty: { padding: 30, alignItems: 'center', width: '100%' },
});
