import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Login from './src/screens/Login.jsx';
import Signup from './src/screens/Signup.jsx';
import Home from './src/screens/Home.jsx';
import Profile from './src/screens/Profile.jsx';
import Call from './src/screens/Call.jsx';
import { theme } from './src/theme.js';
import { loadAuth } from './src/services/api.js';
import { useAuthStore } from './src/stores/auth.store.js';
import {
  enableAppWideScreenshotProtection,
  listenForScreenshotAttempts,
} from './src/services/screenCapture.js';

const Stack = createNativeStackNavigator();

/**
 * Root. Two stacks gated by auth state:
 *
 *   - Anon stack: Login / Signup
 *   - Authed stack: Home / Profile / Call
 *
 * On first mount we hydrate from AsyncStorage so a user who logged in
 * on a previous launch lands straight on Home. While hydrating we
 * render a tiny spinner overlay; the splash from Expo's app.json
 * covers the rest of the gap.
 */
export default function App() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Turn on FLAG_SECURE (Android) + screen-recording detection (iOS)
    // for the entire app. No-op in Expo Go because the native module
    // isn't loaded — once you've built a custom dev client this
    // becomes effective from cold start.
    enableAppWideScreenshotProtection();
    const stopAttempts = listenForScreenshotAttempts(() => {
      // iOS-only: a screenshot was just taken. Hook into telemetry
      // here later if you want to warn / log / show a banner.
      if (__DEV__) console.log('[screenshot] capture attempt');
    });
    loadAuth()
      .then((stored) => {
        if (cancelled) return;
        if (stored.accessToken || stored.user) setAuth(stored);
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
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={Home} />
            <Stack.Screen name="Profile" component={Profile} />
            <Stack.Screen name="Call" component={Call} />
          </Stack.Navigator>
        ) : (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Signup" component={Signup} />
          </Stack.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
