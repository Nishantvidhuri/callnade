import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store.js';
import { useIncomingCallsStore } from '../stores/incomingCalls.store.js';
import { getSocket } from '../services/socket.js';

export function useIncomingCalls() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!accessToken || !me) {
      useIncomingCallsStore.getState().clear();
      return;
    }
    const socket = getSocket();
    const onIncoming = (payload) => useIncomingCallsStore.getState().add(payload);
    const onEnded = ({ callId }) => useIncomingCallsStore.getState().remove(callId);
    socket.on('call:incoming', onIncoming);
    socket.on('call:ended', onEnded);
    socket.on('call:rejected', onEnded);
    socket.on('call:accepted', onEnded);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:ended', onEnded);
      socket.off('call:rejected', onEnded);
      socket.off('call:accepted', onEnded);
    };
  }, [accessToken, me]);
}
