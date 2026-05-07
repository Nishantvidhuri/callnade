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
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!accessToken || !me) return undefined;
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
  }, [accessToken, me]);
}
