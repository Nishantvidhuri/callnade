import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';

import Login from './src/screens/Login.jsx';
import Signup from './src/screens/Signup.jsx';
import Home from './src/screens/Home.jsx';
import Profile from './src/screens/Profile.jsx';
import Call from './src/screens/Call.jsx';
import Calls from './src/screens/Calls.jsx';
import IncomingCall from './src/screens/IncomingCall.jsx';
import Notifications from './src/screens/Notifications.jsx';
import Billing from './src/screens/Billing.jsx';
import AddCredits from './src/screens/AddCredits.jsx';
import Withdraw from './src/screens/Withdraw.jsx';
import AdminMenu from './src/screens/AdminMenu.jsx';
import AdminUsers from './src/screens/AdminUsers.jsx';
import AdminWalletRequests from './src/screens/AdminWalletRequests.jsx';
import AdminVisits from './src/screens/AdminVisits.jsx';
import AdminPaymentQrs from './src/screens/AdminPaymentQrs.jsx';
import { theme } from './src/theme.js';
import { loadAuth } from './src/services/authStorage.js';
import { api } from './src/services/api.js';
import { useAuthStore } from './src/stores/auth.store.js';
import {
  enableAppWideScreenshotProtection,
  listenForScreenshotAttempts,
} from './src/services/screenCapture.js';
import { useIncomingCalls } from './src/hooks/useIncomingCalls.js';
import { useWalletSync } from './src/hooks/useWalletSync.js';
import { useIncomingCallsStore } from './src/stores/incomingCalls.store.js';

const RootStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const CallsStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

/**
 * Calls tab gets its own stack so accepting a ring can push to the
 * IncomingCall (answerer) screen without leaving the tab context.
 */
function CallsStackNav() {
  return (
    <CallsStack.Navigator screenOptions={{ headerShown: false }}>
      <CallsStack.Screen name="CallsTab" component={Calls} />
      <CallsStack.Screen name="IncomingCall" component={IncomingCall} />
    </CallsStack.Navigator>
  );
}

/**
 * Home tab is a stack so the user can drill into a creator's profile
 * + book a call without leaving the Home tab context. The bottom-tab
 * bar stays visible throughout.
 */
function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeFeed" component={Home} />
      <HomeStack.Screen name="Profile" component={Profile} />
      <HomeStack.Screen name="Call" component={Call} />
      <HomeStack.Screen name="Billing" component={Billing} />
      <HomeStack.Screen name="AddCredits" component={AddCredits} />
      <HomeStack.Screen name="Withdraw" component={Withdraw} />
      <HomeStack.Screen name="Admin" component={AdminMenu} />
      <HomeStack.Screen name="AdminUsers" component={AdminUsers} />
      <HomeStack.Screen name="AdminWalletRequests" component={AdminWalletRequests} />
      <HomeStack.Screen name="AdminVisits" component={AdminVisits} />
      <HomeStack.Screen name="AdminPaymentQrs" component={AdminPaymentQrs} />
    </HomeStack.Navigator>
  );
}

/**
 * Profile tab loads the logged-in user's own profile by default.
 * The Admin button on Profile pushes the admin tree into this same
 * stack so the bottom tab bar stays visible throughout.
 */
function ProfileStackNav() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="MyProfile" component={Profile} />
      <ProfileStack.Screen name="Billing" component={Billing} />
      <ProfileStack.Screen name="AddCredits" component={AddCredits} />
      <ProfileStack.Screen name="Withdraw" component={Withdraw} />
      <ProfileStack.Screen name="Admin" component={AdminMenu} />
      <ProfileStack.Screen name="AdminUsers" component={AdminUsers} />
      <ProfileStack.Screen name="AdminWalletRequests" component={AdminWalletRequests} />
      <ProfileStack.Screen name="AdminVisits" component={AdminVisits} />
      <ProfileStack.Screen name="AdminPaymentQrs" component={AdminPaymentQrs} />
    </ProfileStack.Navigator>
  );
}

/**
 * Bottom tab bar — 1:1 mirror of the web's HomeBottomBar.jsx:
 *   Regular users: Home · Calls · Alerts · Profile (4 tabs).
 *   Admins:        Home · Calls · Alerts · Wallet · Profile (5 tabs).
 *
 * Feather icon set is the React Native equivalent of the web's
 * lucide-react. Same visual weight, same line style. Active tint
 * uses the tinder brand pink to match the sidebar's "active route"
 * treatment on the web.
 */
function AppTabs() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = !!(me?.role === 'admin' || me?.isAdmin);
  // Alerts surface (subscriber requests, payouts, system messages) is
  // creator + admin only — regular users have nothing actionable there.
  const isProviderOrAdmin = !!(me?.role === 'provider' || isAdmin);
  // Live ringing count for the Calls-tab badge.
  const ringingCount = useIncomingCallsStore((s) => s.items.length);
  // Pad the tab bar by the OS's bottom safe-area inset so the home
  // indicator line on iOS / the gesture-bar on Android doesn't sit
  // on top of the icons. Falls back to a sensible 10px when the
  // device reports no inset (older Android phones with physical
  // nav buttons).
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 10);
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.tinder,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: theme.colors.border,
          height: 60 + safeBottom,
          paddingBottom: safeBottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const name = ICON_FOR[route.name] || 'circle';
          return (
            <Feather
              name={name}
              size={focused ? size + 1 : size}
              color={color}
              strokeWidth={1.8}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeStackNav} options={{ tabBarLabel: 'Home' }} />
      <Tabs.Screen
        name="Calls"
        component={CallsStackNav}
        options={{
          tabBarLabel: 'Calls',
          tabBarBadge: ringingCount > 0 ? ringingCount : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.tinder, color: '#fff' },
        }}
      />
      {isProviderOrAdmin && (
        <Tabs.Screen name="Alerts" component={Notifications} options={{ tabBarLabel: 'Alerts' }} />
      )}
      {isAdmin && (
        <Tabs.Screen
          name="Wallet"
          component={Billing}
          options={{ tabBarLabel: 'Wallet' }}
        />
      )}
      <Tabs.Screen name="Account" component={ProfileStackNav} options={{ tabBarLabel: 'Profile' }} />
    </Tabs.Navigator>
  );
}

const ICON_FOR = {
  Home: 'home',
  Calls: 'video',
  Alerts: 'bell',
  Wallet: 'credit-card',
  Account: 'user',
};

export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [hydrating, setHydrating] = useState(true);

  // Keep the incoming-calls store in sync with the socket. Mounted
  // here so ringing calls land in the Calls tab regardless of which
  // screen the creator happens to be on.
  useIncomingCalls();
  // Wallet / earnings sync — picks up per-second `wallet:update`
  // events from the backend's billing ticker and patches the auth
  // store so the TopBar pill, Profile balances, and Billing card
  // all tick down (caller) / up (creator) in real time.
  useWalletSync();

  useEffect(() => {
    let cancelled = false;
    enableAppWideScreenshotProtection();
    const stopAttempts = listenForScreenshotAttempts(() => {
      if (__DEV__) console.log('[screenshot] capture attempt');
    });
    loadAuth()
      .then(async (stored) => {
        if (cancelled) return;
        if (stored.accessToken || stored.user) setAuth(stored);
        // Login / signup responses don't always include the wallet
        // fields, and AsyncStorage might be holding a stale snapshot
        // from a previous session. Refresh from /users/me so the
        // wallet pill shows accurate numbers immediately on cold
        // start. Fails silently if the token has expired — the api
        // interceptor will refresh + retry on the next call.
        if (stored.accessToken) {
          try {
            const r = await api.get('/users/me');
            // /users/me returns { user, avatar, gallery } — unwrap so
            // the auth store keeps the user object itself, not the
            // envelope. With the envelope, me.username would be
            // undefined and Profile / TopBar would render blanks.
            const userPayload = r?.data?.user || r?.data;
            if (!cancelled && userPayload) {
              useAuthStore.getState().setUser(userPayload);
            }
          } catch {
            /* token may be invalid; user will hit Login next */
          }
        }
      })
      .finally(() => !cancelled && setHydrating(false));
    return () => {
      cancelled = true;
      stopAttempts();
    };
  }, [setAuth]);

  if (hydrating) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.bg,
        }}
      >
        <ActivityIndicator color={theme.colors.tinder} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.bg} />
      <NavigationContainer>
        {accessToken ? (
          <AppTabs />
        ) : (
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Login" component={Login} />
            <RootStack.Screen name="Signup" component={Signup} />
          </RootStack.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
