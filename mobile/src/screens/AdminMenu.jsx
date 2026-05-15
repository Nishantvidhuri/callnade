import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { theme } from '../theme.js';

/**
 * Admin home — gateway page. Drills into the four admin areas:
 *   - Users:           ban / unban / delete, view consent, KYC.
 *   - Wallet requests: approve / reject top-ups + withdrawals.
 *   - Visits:          per-route visit log.
 *   - Payment QRs:     manage the QR rotation pool.
 *
 * Each row is a Pressable tile that pushes the matching screen.
 */
export default function AdminMenu({ navigation }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} hitSlop={6}>
          <Feather name="arrow-left" size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Admin</Text>
          <Text style={styles.subtitle}>Manage users, payments, and the platform.</Text>
        </View>
        <View style={styles.shieldChip}>
          <Feather name="shield" size={12} color={theme.colors.brand600} />
          <Text style={styles.shieldText}>ADMIN</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30 }}>
        <Card
          icon="users"
          tone="brand"
          title="Users"
          body="Search, ban, soft-delete, restore, or adjust balances."
          onPress={() => navigation.navigate('AdminUsers')}
        />
        <Card
          icon="file-text"
          tone="emerald"
          title="Billing"
          body="Approve or reject pending top-up and withdrawal requests."
          onPress={() => navigation.navigate('AdminWalletRequests')}
        />
        <Card
          icon="map-pin"
          tone="amber"
          title="Visits"
          body="Per-route visit log + user breakdown."
          onPress={() => navigation.navigate('AdminVisits')}
        />
        <Card
          icon="image"
          tone="sky"
          title="Payment QRs"
          body="Rotation pool of UPI QR codes shown to topping-up users."
          onPress={() => navigation.navigate('AdminPaymentQrs')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ icon, tone, title, body, onPress }) {
  const palette = TONE[tone] || TONE.brand;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={[styles.cardIcon, { backgroundColor: palette.bg }]}>
        <Feather name={icon} size={18} color={palette.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={theme.colors.mutedSoft} />
    </Pressable>
  );
}

const TONE = {
  brand: { bg: theme.colors.brand100, fg: theme.colors.brand700 },
  emerald: { bg: '#d1fae5', fg: '#047857' },
  amber: { bg: '#fef3c7', fg: '#b45309' },
  sky: { bg: '#e0f2fe', fg: '#0369a1' },
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fff', borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.ink },
  subtitle: { fontSize: 13, color: theme.colors.muted, marginTop: 2 },
  shieldChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand100,
  },
  shieldText: { color: theme.colors.brand700, fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 10,
    borderRadius: theme.radius.xl,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontWeight: '700', fontSize: 15, color: theme.colors.ink },
  cardBody: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
});
