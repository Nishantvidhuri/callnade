import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useAuthStore } from '../stores/auth.store.js';

/**
 * Single axios instance pointed at the production callnade backend.
 * The base URL comes from app.json's `extra.apiBaseUrl` so a future
 * dev/staging build can swap it without touching code.
 *
 * Mirrors the web frontend's interceptor pattern: every request gets
 * a Bearer token from the auth store, and a 401 triggers a single
 * `/auth/refresh` round-trip before retrying the original request.
 * The refresh is shared across concurrent failures via the
 * `refreshing` promise so we never fan out N parallel refresh calls.
 */
const baseURL =
  Constants.expoConfig?.extra?.apiBaseUrl || 'https://callnade.site/api/v1';

export const api = axios.create({
  baseURL,
  timeout: 15_000,
});

api.interceptors.request.use(async (config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (
      err.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/')
    ) {
      original._retry = true;
      refreshing ||= api
        .post('/auth/refresh')
        .then((r) => {
          useAuthStore.getState().setAccessToken(r.data.accessToken);
          return r.data.accessToken;
        })
        .catch((e) => {
          useAuthStore.getState().clear();
          throw e;
        })
        .finally(() => {
          refreshing = null;
        });
      try {
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        return Promise.reject(err);
      }
    }
    const message = err.response?.data?.error?.message ?? err.message;
    return Promise.reject(new Error(message));
  },
);

/**
 * Persist the auth-store's accessToken across app launches. The web
 * relies on a refresh-token httpOnly cookie that the browser hands
 * back automatically; React Native has no such cookie jar so we
 * mirror the access token in AsyncStorage and re-hydrate on cold
 * start. (For a v1 this is OK — for production we'd ship a
 * refresh-token + secure-store variant.)
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
