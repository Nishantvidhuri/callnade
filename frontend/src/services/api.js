import axios from 'axios';
import { useAuthStore } from '../stores/auth.store.js';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  withCredentials: true,
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry && !original.url.includes('/auth/')) {
      original._retry = true;
      refreshing ||= api
        .post('/auth/refresh')
        .then((r) => {
          useAuthStore.getState().setAccessToken(r.data.accessToken);
          return r.data.accessToken;
        })
        .catch((e) => {
          // Only blow away the local session when the refresh call
          // gets a *definitive* unauthorised response — meaning the
          // server actually checked the cookie and rejected it
          // (banned, deleted, token-version bumped by logout, or
          // truly expired). Network errors, timeouts, 5xx etc. are
          // transient — we leave the user signed in so the next
          // request can retry, instead of bouncing them to /login
          // on every flaky connection.
          if (e?.response?.status === 401) {
            useAuthStore.getState().clear();
          }
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
