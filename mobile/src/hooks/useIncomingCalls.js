import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store.js';
import { useIncomingCallsStore } from '../stores/incomingCalls.store.js';
import { getSocket } from '../services/socket.js';

/**
 * App-level subscription. Push `call:incoming` events into the
 * incoming-calls store; drop entries on `call:ended` / `call:rejected`
 * so a ring doesn't linger after the caller hangs up. Cleared when
 * the user logs out (accessToken disappears).
 */
export function useIncomingCalls() {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      useIncomingCallsStore.getState().clear();
      return undefined;
    }
    const socket = getSocket();

    const onIncoming = (payload) =>
      useIncomingCallsStore.getState().add(payload);
    const onEnded = ({ callId }) =>
      useIncomingCallsStore.getState().remove(callId);

    socket.on('call:incoming', onIncoming);
    socket.on('call:ended', onEnded);
    socket.on('call:rejected', onEnded);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:ended', onEnded);
      socket.off('call:rejected', onEnded);
    };
  }, [accessToken]);
}
