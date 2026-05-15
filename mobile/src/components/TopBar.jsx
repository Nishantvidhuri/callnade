import { useState } from 'react';
import {
  Image, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';
import { theme } from '../theme.js';

/**
 * Mobile top bar — mirrors the web's MobileTopBar.jsx:
 *
 *   - Default state: logo · wallet pill · search button
 *   - Search expanded: ← back · text input
 *
 * Providers see their `earningsBalance` in an amber pill; everyone
 * else sees `walletBalance` in emerald. Matches the web's
 * isProvider branching exactly so the two surfaces feel
 * interchangeable.
 *
 * Props:
 *   onQueryChange — fires on every keystroke when search is open.
 *                    Defaults to a no-op; Home will pass its own
 *                    setter so typing live-filters the grid.
 */
export default function TopBar({ onQueryChange }) {
  const me = useAuthStore((s) => s.user);
  const navigation = useNavigation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const isProvider = me?.role === 'provider';
  const walletValue = isProvider ? (me?.earningsBalance ?? 0) : (me?.walletBalance ?? 0);
  const walletStyle = isProvider ? styles.pillAmber : styles.pillEmerald;
  const walletText = isProvider ? styles.pillAmberText : styles.pillEmeraldText;

  const handleQuery = (v) => {
    setQuery(v);
    onQueryChange?.(v);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    onQueryChange?.('');
  };

  return (
    <View style={styles.wrap}>
      {searchOpen ? (
        <>
          <Pressable
            onPress={closeSearch}
            style={styles.circle}
            hitSlop={6}
            aria-label="Close search"
          >
            <Feather name="x" size={18} color={theme.colors.ink} />
          </Pressable>
          <TextInput
            autoFocus
            value={query}
            onChangeText={handleQuery}
            placeholder="Search people"
            placeholderTextColor={theme.colors.mutedSoft}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </>
      ) : (
        <>
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {me ? (
            <Pressable
              onPress={() => navigation.navigate('Billing')}
              style={[styles.pill, walletStyle]}
              hitSlop={6}
            >
              <Feather
                name="credit-card"
                size={14}
                color={isProvider ? '#b45309' : '#047857'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.pillText, walletText]} numberOfLines={1}>
                {fmtCredits(walletValue)}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setSearchOpen(true)}
            style={styles.circle}
            hitSlop={6}
            aria-label="Search"
          >
            <Feather name="search" size={18} color={theme.colors.ink} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,245,249,0.92)',
    borderBottomColor: '#fecdd3', // rose-100
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logoWrap: { flex: 1, alignItems: 'flex-start' },
  logo: { width: 56, height: 32 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  pillEmerald: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }, // emerald-50/200
  pillAmber: { backgroundColor: '#fffbeb', borderColor: '#fde68a' }, // amber-50/200
  pillText: { fontWeight: '700', fontSize: 14 },
  pillEmeraldText: { color: '#047857' }, // emerald-700
  pillAmberText: { color: '#b45309' }, // amber-700
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 16,
    height: 40,
    fontSize: 14,
    borderRadius: theme.radius.pill,
    backgroundColor: '#ffffff',
    color: theme.colors.ink,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
});
