/**
 * Google Identity Services (GIS) loader. Pulls the official client
 * library on demand and resolves with `window.google.accounts.id`.
 *
 * Usage:
 *   const idToken = await googleSignIn();
 *   const { data } = await api.post('/auth/google', { idToken });
 *
 * The popup is initiated programmatically — we don't render Google's
 * pre-built button so the existing branded "Continue with Google" UI
 * keeps working.
 */
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;

function loadGsi() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('GIS must run in a browser'));
  }
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.accounts.id));
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google?.accounts?.id);
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Google Sign-In'));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Trigger the Google sign-in popup and resolve with the ID token.
 *
 * Implementation: GIS doesn't expose a "promisified popup" API
 * directly, so we use `oauth2.initTokenClient` with response_type
 * 'id_token' indirectly via `google.accounts.id.initialize` +
 * a render call to a hidden div. The cleanest way that works
 * across browsers without the One Tap UX is `id.initialize` with
 * a callback + `id.prompt()` for the One Tap, OR a proper popup
 * via the `google.accounts.oauth2` flow. We use the credentials
 * flow (`google.accounts.id.initialize` + `prompt`) which gives
 * us a verified id_token directly.
 */
export async function googleSignIn() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Google sign-in is not configured (set VITE_GOOGLE_CLIENT_ID).');
  }
  const idApi = await loadGsi();

  return new Promise((resolve, reject) => {
    let settled = false;
    const handleCredential = (response) => {
      if (settled) return;
      settled = true;
      if (response?.credential) resolve(response.credential);
      else reject(new Error('No credential returned from Google'));
    };

    idApi.initialize({
      client_id: clientId,
      callback: handleCredential,
      // ux_mode 'popup' opens a small Google account picker; safer
      // than 'redirect' which would leave the page.
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    // Fall back to `prompt()` (the One Tap / sign-in dialog). If
    // that's blocked (e.g. user dismissed too many times, FedCM
    // unsupported), surface a clear error so the caller can show a
    // message instead of just hanging.
    idApi.prompt((notification) => {
      if (settled) return;
      // GIS notification API: notifications fire for skipped/dismissed
      // states. We only treat them as errors if no credential ever
      // arrived AND the prompt is no longer displayable.
      const skipped =
        typeof notification?.isSkippedMoment === 'function' && notification.isSkippedMoment();
      const dismissed =
        typeof notification?.isDismissedMoment === 'function' && notification.isDismissedMoment();
      if (skipped || dismissed) {
        const reason =
          (typeof notification?.getSkippedReason === 'function' && notification.getSkippedReason()) ||
          (typeof notification?.getDismissedReason === 'function' &&
            notification.getDismissedReason()) ||
          'cancelled';
        // Give the credential callback a moment to fire if it's about
        // to — only reject if nothing landed within ~200ms.
        setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error(`Google sign-in ${reason}`));
          }
        }, 200);
      }
    });
  });
}
