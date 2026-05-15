import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AsyncStorage helpers for the auth state. Lives in its own file so
 * the auth store can import these helpers without re-entering api.js
 * (which would create a circular dep: api → store → api).
 *
 * The token is mirrored to disk so cold starts can skip the login
 * screen. For v2 we'll move it into expo-secure-store; AsyncStorage
 * is fine for an MVP because the token already has a short TTL and
 * the refresh flow is server-side.
 */
const ACCESS_KEY = 'callnade.accessToken';
const USER_KEY = 'callnade.user';

export async function persistAuth({ accessToken, user }) {
  await Promise.all([
    accessToken
      ? AsyncStorage.setItem(ACCESS_KEY, accessToken)
      : AsyncStorage.removeItem(ACCESS_KEY),
    user
      ? AsyncStorage.setItem(USER_KEY, JSON.stringify(user))
      : AsyncStorage.removeItem(USER_KEY),
  ]);
}

export async function loadAuth() {
  const [token, userJson] = await Promise.all([
    AsyncStorage.getItem(ACCESS_KEY),
    AsyncStorage.getItem(USER_KEY),
  ]);
  return {
    accessToken: token || null,
    user: userJson ? JSON.parse(userJson) : null,
  };
}
