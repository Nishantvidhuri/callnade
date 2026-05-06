import { useEffect } from 'react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';

export function useAuth() {
  const { user, accessToken, setAuth, clear } = useAuthStore();

  useEffect(() => {
    if (user || !accessToken) return;
    api
      .get('/users/me')
      .then((r) => useAuthStore.getState().setUser(r.data.user))
      .catch(() => clear());
  }, [user, accessToken, clear]);

  return { user, accessToken, setAuth, clear, isAuthed: !!accessToken };
}

export async function bootstrapAuth() {
  try {
    const r = await api.post('/auth/refresh');
    useAuthStore.getState().setAccessToken(r.data.accessToken);
    const me = await api.get('/users/me');
    useAuthStore.getState().setUser(me.data.user);
  } catch {
    /* not logged in */
  }
}
