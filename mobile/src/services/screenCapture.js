import { useEffect } from 'react';
import {
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
  addScreenshotListener,
  removeScreenshotListener,
} from 'expo-screen-capture';

/**
 * Cross-platform screen-capture defence.
 *
 * Android — sets FLAG_SECURE on the activity window. Real prevention:
 *   the screenshot UI shows a black frame, recordings get blanked,
 *   even system-level screen-capture stops returning frames. This is
 *   the same flag Instagram Stories / banking apps use.
 *
 * iOS — no public API can block screenshots outright. The Expo
 *   package wires up `UIScreen.isCaptured` so we can react to screen
 *   recording (the screen turns red on recording in our overlay if
 *   we want it later) and a notification fires AFTER a screenshot.
 *   We log it for now; the heavier "blur the call when isCaptured"
 *   pattern is an obvious follow-up once we have the call screen.
 *
 * Calling `enableAppWideScreenshotProtection()` once at app boot is
 * fine for a small app like this — the flag is set once and stays
 * set for the activity's lifetime. If you ever want screen-by-screen
 * scoping, use the `useScreenCaptureProtection()` hook below.
 */
export async function enableAppWideScreenshotProtection() {
  try {
    await preventScreenCaptureAsync('callnade');
  } catch {
    // Native module isn't loaded (Expo Go, web, etc.). Silent —
    // we don't want to crash the app over a security UX nicety.
  }
}

export async function disableAppWideScreenshotProtection() {
  try {
    await allowScreenCaptureAsync('callnade');
  } catch {}
}

/**
 * React hook variant — turns the flag ON while the host component is
 * mounted, OFF on unmount. Use this on the Call / Profile / Gallery
 * screens if you want to scope protection rather than apply it
 * app-wide.
 */
export function useScreenCaptureProtection(enabled = true, tag = 'screen') {
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    preventScreenCaptureAsync(tag).catch(() => {});
    return () => {
      cancelled = true;
      allowScreenCaptureAsync(tag).catch(() => {});
      void cancelled;
    };
  }, [enabled, tag]);
}

/**
 * Listen for the iOS "user took a screenshot" notification. Returns
 * the cleanup function. iOS-only effect — Android no-ops because
 * FLAG_SECURE already prevented the capture. Hook it up if you want
 * to log to your backend or warn the creator that someone tried to
 * screenshot them.
 */
export function listenForScreenshotAttempts(onAttempt) {
  let sub = null;
  try {
    sub = addScreenshotListener(onAttempt);
  } catch {}
  return () => {
    if (sub) {
      try { removeScreenshotListener(sub); } catch {}
    }
  };
}
