import { api } from './api.js';

const SESSION_KEY = 'callnade:visit-logged-as';

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

    const payload = {
      language: navigator.language || null,
      timezone: Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || null,
      screen: window.screen ? `${window.screen.width}x${window.screen.height}` : null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio || 1,
      referrer: document.referrer || null,
      path: window.location.pathname || null,
    };

    await api.post('/visits', payload);
  } catch {
    /* swallow — never surface visit-log errors */
  }
}
