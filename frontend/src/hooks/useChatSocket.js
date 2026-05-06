import { useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store.js';
import { useChatStore } from '../stores/chat.store.js';
import { getSocket, disconnectSocket } from '../services/socket.js';

export function useChatSocket() {
  const me = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken || !me) {
      disconnectSocket();
      return;
    }
    const socket = getSocket();

    const myId = String(me._id);

    const onMessage = (msg) => {
      const peerId = String(msg.from.id) === myId ? String(msg.to) : String(msg.from.id);
      useChatStore.getState().addMessage(peerId, msg, {
        incoming: String(msg.from.id) !== myId,
      });
    };

    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
    };
  }, [accessToken, me]);
}
