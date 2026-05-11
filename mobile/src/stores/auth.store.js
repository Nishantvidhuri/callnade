import { create } from 'zustand';
import { persistAuth } from '../services/api.js';

/**
 * Auth state — accessToken + the user payload returned by /auth/me
 * (and by /auth/login / /auth/signup which include a `user` field).
 *
 * `setAuth({ accessToken, user })` is what the login / signup screens
 * call after a successful response. It writes both Zustand state and
 * AsyncStorage so the next cold start re-hydrates without a manual
 * login. `clear()` flushes both on logout.
 */
export const useAuthStore = create((set, get) => ({
  accessToken: null,
  user: null,

  setAuth: ({ accessToken, user }) => {
    set({ accessToken: accessToken ?? null, user: user ?? null });
    persistAuth({ accessToken, user }).catch(() => {});
  },

  setAccessToken: (token) => {
    set({ accessToken: token });
    persistAuth({ accessToken: token, user: get().user }).catch(() => {});
  },

  setUser: (user) => {
    set({ user });
    persistAuth({ accessToken: get().accessToken, user }).catch(() => {});
  },

  clear: () => {
    set({ accessToken: null, user: null });
    persistAuth({ accessToken: null, user: null }).catch(() => {});
  },
}));
