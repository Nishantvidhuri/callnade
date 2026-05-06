import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store.js';

let socket = null;

export function getSocket() {
  if (socket?.connected || socket?.active) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  const token = useAuthStore.getState().accessToken;
  socket = io({
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    autoConnect: true,
  });

  // Re-authenticate with the latest token on each reconnect (handy if it was refreshed)
  socket.on('reconnect_attempt', () => {
    socket.auth = { token: useAuthStore.getState().accessToken };
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
