import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store.js';

let socket = null;

/**
 * In dev we bypass the Vite proxy and connect socket.io straight at
 * the backend's port. Vite's `/socket.io` proxy with `ws: true` does
 * forward HTTP polling fine, but the WebSocket upgrade can be flaky
 * — when it fails, socket.io silently falls back to long-polling and
 * batches events in ~25–30s windows. That makes per-second wallet
 * ticks look like 30s jumps.
 *
 * Override via VITE_SOCKET_URL if you ever need to point at a
 * different host (e.g. an ngrok tunnel running the backend).
 */
function socketUrl() {
  const explicit = import.meta.env.VITE_SOCKET_URL;
  if (explicit) return explicit;
  if (!import.meta.env.DEV) return undefined; // prod → nginx proxy

  // Dev: only bypass the Vite proxy when the page itself is on
  // localhost. If it's coming through an ngrok / Cloudflare tunnel
  // (so the mobile device can reach it), fall back to the
  // same-origin path so the tunnel forwards `/socket.io` via Vite's
  // ws-proxy. The mobile phone has no localhost:4000 to hit.
  const host =
    typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:4000';
  }
  return undefined;
}

export function getSocket() {
  if (socket?.connected || socket?.active) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  const token = useAuthStore.getState().accessToken;
  const url = socketUrl();
  socket = io(url || undefined, {
    path: '/socket.io',
    auth: { token },
    // Force WebSocket only — polling is the slow fallback that was
    // hiding the WS-upgrade failure. If WS doesn't connect we want a
    // visible error, not a silently throttled session.
    transports: ['websocket'],
    upgrade: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    autoConnect: true,
    withCredentials: true,
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
