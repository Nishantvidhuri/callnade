import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api.js';
import { theme } from '../theme.js';
import PresenceDot from '../components/PresenceDot.jsx';

/**
 * Read-only creator profile: avatar, name, bio, gallery, packages.
 * Tapping a package routes to the Call screen which currently shows
 * the placeholder (real WebRTC needs a custom Expo dev client with
 * `react-native-webrtc`).
 */
export default function Profile({ route, navigation }) {
  const { username } = route.params || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!username) return;
    api
      .get(`/users/${username}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
  }, [username]);

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={[styles.muted, { padding: 16, color: theme.colors.danger }]}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={theme.colors.tinder} />
      </SafeAreaView>
    );
  }

  const u = data.user;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={{ fontSize: 16, color: theme.colors.muted }}>← Back</Text>
        </Pressable>

        <View style={styles.header}>
          {data.avatar?.urls?.thumb ? (
            <Image source={{ uri: data.avatar.urls.thumb }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '600' }}>
                {(u.displayName || u.username).charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.name}>{u.displayName || u.username}</Text>
              <PresenceDot status={u.presence} size={10} />
            </View>
            <Text style={styles.handle}>@{u.username}</Text>
            {u.bio ? <Text style={styles.bio}>{u.bio}</Text> : null}
          </View>
        </View>

        {!!data.gallery?.length && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Photos</Text>
            <FlatList
              horizontal
              data={data.gallery}
              keyExtractor={(it) => String(it.id)}
              renderItem={({ item }) =>
                item.urls?.thumb ? (
                  <Image source={{ uri: item.urls.thumb }} style={styles.galleryThumb} />
                ) : null
              }
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            />
          </View>
        )}

        {!!data.packages?.length && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Packages</Text>
            {data.packages.map((p) => (
              <Pressable
                key={p.id}
                onPress={() =>
                  navigation.navigate('Call', {
                    peerId: u._id || u.id,
                    peerLabel: u.displayName || u.username,
                    packageId: p.id,
                    callType: p.callType || 'video',
                  })
                }
                style={styles.pkg}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.pkgTitle}>{p.title}</Text>
                  {p.durationMinutes != null ? (
                    <Text style={styles.pkgMeta}>{p.durationMinutes} min</Text>
                  ) : null}
                </View>
                <Text style={styles.pkgPrice}>₹{p.price}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  muted: { color: theme.colors.muted },
  back: { padding: 16 },
  header: { flexDirection: 'row', padding: 16, alignItems: 'flex-start' },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: {
    backgroundColor: theme.colors.tinder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 20, fontWeight: '700', color: theme.colors.ink },
  handle: { color: theme.colors.muted, marginTop: 2 },
  bio: { color: theme.colors.ink, marginTop: 8, lineHeight: 20 },
  section: { marginTop: 18 },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  galleryThumb: { width: 110, height: 140, borderRadius: 14, backgroundColor: theme.colors.border },
  pkg: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pkgTitle: { fontWeight: '600', color: theme.colors.ink },
  pkgMeta: { color: theme.colors.muted, fontSize: 12, marginTop: 2 },
  pkgPrice: { fontWeight: '800', color: theme.colors.success, fontSize: 16 },
});
