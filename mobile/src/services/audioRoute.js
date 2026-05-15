/**
 * Audio routing for in-call audio. react-native-webrtc on Android
 * defaults to the earpiece (small phone-call speaker at the top of
 * the device); on iOS it picks a route based on the active
 * AVAudioSession category. We want video calls to come out of the
 * main / loudspeaker so the conversation isn't "press your ear to
 * the phone" quiet.
 *
 * `react-native-incall-manager` wraps both platforms:
 *   - Android: AudioManager.setMode(IN_COMMUNICATION) +
 *              AudioManager.setSpeakerphoneOn(true)
 *   - iOS:     AVAudioSession portOverride = .speaker
 *
 * The native module is dynamically required so JS-only environments
 * (Expo Go, web preview) keep loading instead of crashing — the
 * speaker switch silently no-ops there.
 */

let InCallManager = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  InCallManager = require('react-native-incall-manager').default;
} catch {
  InCallManager = null;
}

export function startCallAudio({ video = true } = {}) {
  if (!InCallManager) return;
  try {
    InCallManager.start({ media: video ? 'video' : 'audio', auto: false });
    // Speaker on by default for video calls. Audio-only behaves like
    // a regular phone call (earpiece) so users can hold the phone up
    // to their ear if they want — flip the flag if you'd rather
    // force loudspeaker for audio too.
    InCallManager.setForceSpeakerphoneOn(true);
    if (video) InCallManager.setSpeakerphoneOn(true);
    InCallManager.setKeepScreenOn(true);
  } catch {
    /* native module missing — silent no-op */
  }
}

export function stopCallAudio() {
  if (!InCallManager) return;
  try {
    InCallManager.setForceSpeakerphoneOn(false);
    InCallManager.setKeepScreenOn(false);
    InCallManager.stop();
  } catch {}
}

export function setSpeakerOn(on) {
  if (!InCallManager) return;
  try {
    InCallManager.setForceSpeakerphoneOn(on);
    InCallManager.setSpeakerphoneOn(on);
  } catch {}
}
