import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store.js';
import { getSocket } from '../services/socket.js';

/**
 * Keep the auth-store user's walletBalance / earningsBalance in sync
 * with what the backend computes during live calls.
 *
 * The backend emits a `wallet:update` event on every billing tick
 * with whichever side moved (`{ walletBalance }` for the caller,
 * `{ earningsBalance }` for the creator). We patch the auth-store
 * `user` object so the wallet pill, sidebar, billing page, and any
 * other surface that reads `me.walletBalance` / `me.earningsBalance`
 * stays current — without forcing a full /users/me refetch.
 *
 * Mounts once at the App level alongside useIncomingCalls / useNotifications.
 */
export function useWalletSync() {
  // Subscribe only to `accessToken` — using `me` as a dep would
  // re-bind the listener on every patch (since we patch `me` here on
  // each wallet:update), occasionally dropping in-flight events
  // during the unsub→resub gap. We read current `me` lazily inside
  // the callback via `getState()` instead.
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return undefined;
    if (!useAuthStore.getState().user) return undefined;
    const socket = getSocket();

    const onWallet = (payload) => {
      const patch = {};
      if (typeof payload?.walletBalance === 'number') {
        patch.walletBalance = payload.walletBalance;
      }
      if (typeof payload?.earningsBalance === 'number') {
        patch.earningsBalance = payload.earningsBalance;
      }
      if (!Object.keys(patch).length) return;

      const current = useAuthStore.getState().user;
      if (!current) return;
      useAuthStore.getState().setUser({ ...current, ...patch });
    };

    socket.on('wallet:update', onWallet);
    return () => {
      socket.off('wallet:update', onWallet);
    };
  }, [accessToken]);
}
