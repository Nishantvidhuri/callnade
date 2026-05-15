import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store.js';
import { getSocket } from '../services/socket.js';

/**
 * Keep the auth-store user's walletBalance / earningsBalance in
 * sync with the backend's per-second billing emits.
 *
 * Direct port of frontend/src/hooks/useWalletSync.js. The backend's
 * 1Hz ticker in call.handlers.js emits `wallet:update` to both
 * peers with whichever side moved:
 *
 *   - caller   → { walletBalance: liveCallerBalance }
 *   - creator  → { earningsBalance: liveCalleeBalance }
 *
 * Mounted once at the App level so the TopBar pill / Profile /
 * Billing all see fresh numbers regardless of which screen the
 * user is on during the call. Same pattern protects us against the
 * RN re-render quirk where reading `me` inside the effect would
 * cause an unsub/resub on every tick and drop events.
 */
export function useWalletSync() {
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
      if (typeof payload?.referralWalletBalance === 'number') {
        patch.referralWalletBalance = payload.referralWalletBalance;
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
