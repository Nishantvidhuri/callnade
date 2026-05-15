import { io } from 'socket.io-client';
import Constants from 'expo-constants';
import { useAuthStore } from '../stores/auth.store.js';

/**
 * socket.io client. Mirrors the web's services/socket.js with
 * mobile-specific tweaks:
 *
 *   - Token comes from the auth store and is injected in the
 *     handshake.auth payload. Backend's io.use middleware reads it.
 *
 *   - We auto-reconnect with the latest token whenever the auth
 *     store's accessToken changes — the api.js 401 interceptor
 *     refreshes tokens silently, and without this hook the socket
 *     would keep using a stale token forever.
 *
 *   - Connection events are logged via __DEV__ so you can `adb logcat`
 *     for "[socket]" and immediately see whether the connect / auth
 *     handshake succeeded.
 */
const apiBase = Constants.expoConfig?.extra?.apiBaseUrl || 'https://callnade.site/api/v1';
const SOCKET_URL = apiBase.replace(/\/api\/v\d+\/?$/, '');

let socket = null;
let lastToken = null;

function wireLogs(s) {
  if (!__DEV__) return;
  s.on('connect', () => console.log('[socket] connected', s.id));
  s.on('disconnect', (reason) => console.log('[socket] disconnect:', reason));
  s.on('connect_error', (err) => console.log('[socket] connect_error:', err?.message));
}

export function getSocket() {
  const token = useAuthStore.getState().accessToken || null;

  // If the token rotated since the last connect (e.g. /auth/refresh
  // bumped it), tear down and reconnect with the fresh credential.
  if (socket && lastToken !== token) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }

  if (socket?.connected || socket?.active) return socket;

  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    upgrade: false,
    forceNew: true,
    auth: token ? { token } : undefined,
    timeout: 12_000,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4_000,
  });
  lastToken = token;
  wireLogs(socket);
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  try { socket.disconnect(); } catch {}
  socket = null;
  lastToken = null;
}

// Cross-tab style reactivity: whenever the auth-store token flips,
// force a fresh socket so the new credential is on the next connect.
// Mounted at module load so it covers all callers, including the
// app-level useWalletSync / useIncomingCalls hooks.
useAuthStore.subscribe((state, prev) => {
  if (state.accessToken !== prev.accessToken) {
    if (socket) {
      try { socket.disconnect(); } catch {}
      socket = null;
      lastToken = null;
    }
    // Re-create immediately if we have a token; otherwise wait for
    // the next caller (login screen, etc.) to demand it.
    if (state.accessToken) getSocket();
  }
});
