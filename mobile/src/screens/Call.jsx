import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme.js';

/**
 * Placeholder. WebRTC on React Native needs `react-native-webrtc`,
 * which is a native module — Expo Go can't load it. To enable real
 * calls:
 *
 *   1. `npx expo install react-native-webrtc`
 *   2. `npx expo prebuild` to generate native ios/android folders
 *   3. Add the camera + microphone Info.plist usage strings + the
 *      Android RECORD_AUDIO/CAMERA permissions (already declared in
 *      app.json).
 *   4. Build a custom dev client (`eas build -p android --profile development`).
 *
 * Once the dev client is up, port the signaling logic from
 * frontend/src/pages/Call.jsx — same socket.io contract works.
 */
export default function Call({ route, navigation }) {
  const { peerLabel, callType } = route.params || {};
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.title}>📞 Call placeholder</Text>
        <Text style={styles.muted}>
          {callType === 'audio' ? 'Audio' : 'Video'} call to {peerLabel || 'creator'}
        </Text>
        <Text style={styles.body}>
          Native WebRTC isn’t wired up yet. Add `react-native-webrtc` via a
          custom Expo dev client (see the comment block in this file) to
          enable real calls. The signaling is identical to the web — same
          socket.io events, same /api/v1/turn-credentials endpoint.
        </Text>

        <Pressable style={styles.cta} onPress={() => navigation.goBack()}>
          <Text style={styles.ctaText}>Go back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  muted: { color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  body: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 18,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 14,
  },
  cta: {
    marginTop: 24,
    backgroundColor: theme.colors.tinder,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: theme.radius.pill,
  },
  ctaText: { color: '#fff', fontWeight: '700' },
});
