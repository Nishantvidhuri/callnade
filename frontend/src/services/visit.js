import { api } from './api.js';
import { useAuthStore } from '../stores/auth.store.js';

const SESSION_KEY = 'callnade:visit-logged-as';

function buildPayload(extraPath) {
  if (typeof window === 'undefined') return null;
  return {
    language: navigator.language || null,
    timezone: Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || null,
    screen: window.screen ? `${window.screen.width}x${window.screen.height}` : null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio || 1,
    referrer: document.referrer || null,
    path: extraPath || window.location.pathname || null,
  };
}

/**
 * Log a visit once per (browser session × identity). Re-fires when the
 * user's identity changes within the same tab, so we capture:
 *   - anonymous visitor on first load              → 1 log
 *   - same tab, then they log in as alice          → 2 logs
 *   - then they log out                            → 3 logs
 *
 * Pass `userId` as the current user's id (or null for anonymous). Fails
 * silently — logging must never block the app or surface errors.
 */
export async function logVisitOnce(userId = null) {
  try {
    if (typeof window === 'undefined') return;
    const key = userId ? `user:${userId}` : 'anon';
    if (sessionStorage.getItem(SESSION_KEY) === key) return;
    // Set immediately so concurrent calls bail before sending duplicates.
    sessionStorage.setItem(SESSION_KEY, key);

    const payload = buildPayload();
    if (!payload) return;
    await api.post('/visits', payload);
  } catch {
    /* swallow — never surface visit-log errors */
  }
}

/**
 * Force-log a visit regardless of session dedup. Used for explicit
 * interactions (e.g. tapping a button on the 18+ age-gate modal) where
 * we want a server-side row every single time, not just the first load
 * of the tab.
 *
 * `tag` is appended to the path field so admins can tell what the user
 * actually did, e.g. "/__age-gate/accept" vs "/__age-gate/exit".
 *
 * Uses `fetch` with `keepalive: true` so the request survives the page
 * navigating away mid-flight (the "exit" tap redirects to google.com
 * immediately — without keepalive the POST would be cancelled).
 */
export function forceLogVisit(tag) {
  try {
    if (typeof window === 'undefined') return;
    const payload = buildPayload(tag ? `/__${tag}` : undefined);
    if (!payload) return;

    const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
    const url = `${baseURL}/visits`;
    const headers = { 'Content-Type': 'application/json' };
    const token = useAuthStore.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;

    // keepalive lets the browser flush this POST even after the page
    // unloads / navigates — critical for the "Take me out" tap.
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers,
      body: JSON.stringify(payload),
    }).catch(() => {
      /* swallow — never surface visit-log errors */
    });
  } catch {
    /* swallow */
  }
}
