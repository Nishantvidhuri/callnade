import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store.js';
import { usePresenceStore } from '../stores/presence.store.js';
import { getSocket } from '../services/socket.js';

/**
 * Subscribe the presence store to backend `presence:update` events.
 *
 * Mounted once at the App level (alongside useWalletSync) so the dot
 * on every visible UserCard / Profile flips in real time when a
 * creator goes online → busy → offline. Subscribes only to
 * `accessToken` (not `me`) for the same reason useWalletSync does:
 * patching me in another sync would unbind/rebind us and we'd miss
 * events in the gap.
 */
export function usePresenceSync() {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return undefined;
    const socket = getSocket();
    const apply = usePresenceStore.getState().apply;

    const onUpdate = (payload) => {
      if (!payload?.userId || !payload?.status) return;
      apply(payload);
    };

    socket.on('presence:update', onUpdate);
    return () => {
      socket.off('presence:update', onUpdate);
    };
  }, [accessToken]);
}
