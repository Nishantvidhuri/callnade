import AgoraRTC from 'agora-rtc-sdk-ng';
import { api } from './api.js';

/**
 * Thin wrapper around Agora RTC SDK for callnade's 1:1 video calling.
 *
 * Drop-in replacement for services/zego.js — same exported function
 * names, same call-site contract — so Call.jsx / IncomingCall.jsx
 * swap engines with a single import flip.
 *
 * One Agora client per active call (keyed by callId). The remote
 * tracks come in as Agora track objects; we wrap them in standard
 * MediaStream instances so the existing `<video>`.srcObject hookup
 * doesn't have to change.
 *
 * The socket layer (call:invite / accept / hangup / billing) is
 * unchanged — Agora only owns the media plane.
 */

const AGORA_APP_ID = String(import.meta.env.VITE_AGORA_APP_ID || '');

// Mute the SDK's chatty internal logging. Default is 'INFO' which
// spews ICE/RTC stats every few seconds. 'WARNING' keeps real issues
// visible without drowning the browser console.
try { AgoraRTC.setLogLevel(2); } catch {}

// Keyed by callId. Each entry: { client, mic, cam, remoteStreams }.
// `republishLocalMedia` looks up the client here so the room session
// stays alive across track swaps.
const sessions = new Map();

/** Fetch an Agora RTC token for the given channel from our backend. */
async function fetchAgoraToken(channel) {
  const { data } = await api.get('/agora/token', { params: { channel } });
  return data; // { appId, channel, uid, token, expiresAt }
}

export function streamIdFor(callId, userId) {
  return `${callId}_${userId}`;
}

/**
 * Join an Agora channel and publish the local camera/mic. Same
 * contract as zego.joinAndPublish:
 *
 *   const { localStream, streamId, leave } = await joinAndPublish({
 *     callId, userId, callType, onRemoteStream, onRoomState,
 *   });
 *
 * - `localStream` is a MediaStream wrapping the Agora local tracks
 *   so it plugs straight into `<video>`.srcObject.
 * - `streamId` is the deterministic `${callId}_${userId}` string
 *   the legacy callers expect.
 * - `leave()` unpublishes, leaves the channel, closes tracks.
 */
export async function joinAndPublish({
  callId,
  userId,
  callType = 'video',
  onRemoteStream,
  onRoomState,
  // Optional <video> / <div> element for local preview. When passed
  // we use Agora's native `track.play(el)` instead of relying on
  // srcObject — Agora's pipeline doesn't always feed frames to a
  // sibling MediaStream consumer, which is why srcObject-only
  // wiring showed a black local tile.
  playLocalInto,
  // Optional <video> / <div> for the remote tile. When passed, the
  // remote video is rendered via Agora's play() too; when omitted,
  // we fall back to the legacy MediaStream-via-onRemoteStream path.
  playRemoteInto,
  // Optional URL to a pre-recorded clip. When provided, the outgoing
  // VIDEO track is the clip looped on a hidden <video> element
  // (captureStream() → Agora custom track). Mic stays live so the
  // creator can still talk. Used by the admin-flipped
  // `usePlaybackVideo` mode.
  playbackVideoUrl,
}) {
  if (!callId || !userId) throw new Error('agora.joinAndPublish: missing args');
  if (!AGORA_APP_ID) {
    throw new Error('Agora not configured — set VITE_AGORA_APP_ID in frontend/.env');
  }

  const channel = String(callId);
  const tokenResp = await fetchAgoraToken(channel);

  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  const session = { client, mic: null, cam: null, remoteStreams: new Map() };
  sessions.set(channel, session);

  // ---- event wiring -------------------------------------------------
  // Render the remote into the caller-supplied element via Agora's
  // native play(); fall back to the MediaStream-via-onRemoteStream
  // path when no element is provided. Agora's native renderer is
  // more reliable than wrapping MediaStreamTrack handles.
  const deliverRemote = (user) => {
    if (playRemoteInto && user.videoTrack) {
      // `contain` preserves the source aspect ratio (landscape stays
      // landscape, portrait stays portrait — black bars fill the gap
      // when the tile shape differs). `cover` would crop, which was
      // mangling the playback clip when its aspect didn't match.
      try { user.videoTrack.play(playRemoteInto, { fit: 'contain' }); } catch {}
    }
    if (user.audioTrack) {
      try { user.audioTrack.play(); } catch {}
    }
    if (onRemoteStream) {
      const ms = new MediaStream();
      if (user.videoTrack) {
        try { ms.addTrack(user.videoTrack.getMediaStreamTrack()); } catch {}
      }
      if (user.audioTrack) {
        try { ms.addTrack(user.audioTrack.getMediaStreamTrack()); } catch {}
      }
      if (ms.getTracks().length) {
        session.remoteStreams.set(user.uid, ms);
        onRemoteStream(ms, String(user.uid));
      }
    }
  };

  const onPublished = async (user, mediaType) => {
    try {
      await client.subscribe(user, mediaType);
      if (mediaType === 'audio') {
        // We still play the audio track via .play() because Agora
        // gates autoplay on the SDK's element; the remote <video>
        // showing the videoTrack is video-only.
        try { user.audioTrack?.play(); } catch {}
      }
      deliverRemote(user);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('agora: subscribe failed', err);
    }
  };
  const onUnpublished = (user) => {
    deliverRemote(user);
  };
  const onUserLeft = (user) => {
    session.remoteStreams.delete(user.uid);
  };
  // Map Agora connection-state-change → the Zego-shaped onRoomState
  // codes Call.jsx already handles ('KICKOUT' / 'TOKEN_EXPIRED').
  const onConnState = (curState, _prevState, reason) => {
    if (!onRoomState) return;
    if (curState === 'DISCONNECTED' && reason === 'UID_BANNED') onRoomState('KICKOUT');
    else if (reason === 'TOKEN_EXPIRED' || reason === 'TOKEN_PRIVILEGE_WILL_EXPIRE') onRoomState('TOKEN_EXPIRED');
    else onRoomState(curState); // 'CONNECTED' / 'DISCONNECTED' etc.
  };
  client.on('user-published', onPublished);
  client.on('user-unpublished', onUnpublished);
  client.on('user-left', onUserLeft);
  client.on('connection-state-change', onConnState);

  // ---- join + create tracks + publish ------------------------------
  await client.join(tokenResp.appId, channel, tokenResp.token, tokenResp.uid);

  // Branch on playback mode. When a `playbackVideoUrl` is provided
  // we wrap the pre-recorded clip as a custom video track and pair
  // it with a live mic — same `mic + cam` shape the rest of this
  // module expects, just with `cam` swapped for the synthesized one.
  let mic, cam, playbackEl;
  if (playbackVideoUrl && callType === 'video') {
    ({ mic, cam, playbackEl } = await createPlaybackTracks(playbackVideoUrl));
  } else {
    ({ mic, cam } = await createLocalTracks(callType));
  }
  session.mic = mic;
  session.cam = cam;
  session.playbackEl = playbackEl || null;
  if (playLocalInto && cam) {
    // Local preview uses the same fit rule. `contain` keeps the
    // creator's own thumbnail aspect-correct — important when the
    // outgoing video is a pre-recorded portrait clip.
    try { cam.play(playLocalInto, { fit: 'contain', mirror: false }); } catch {}
  }
  const toPublish = [mic, cam].filter(Boolean);
  if (toPublish.length) await client.publish(toPublish);

  // Auto-reacquire when the camera gets yanked by another app on
  // mobile. Two signals to watch:
  //   1. Agora fires `track-ended` on the local cam track when the
  //      underlying MediaStreamTrack dies (browser/OS revoked the
  //      device).
  //   2. The page coming back to the foreground after the user
  //      backgrounds the tab to open WhatsApp / Camera / etc.
  // Either signal queues a republishLocalMedia internally so the
  // user doesn't have to mash the Refresh button.
  let recovering = false;
  const recover = async () => {
    if (recovering || !sessions.has(channel)) return;
    recovering = true;
    try {
      await republishLocalMedia({
        callId, userId, callType,
        oldStream: undefined, oldStreamId: undefined,
        playLocalInto,
      });
    } catch {
      /* OS may still be holding the camera; next event will retry */
    } finally {
      recovering = false;
    }
  };
  const onCamEnded = () => recover();
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    const live = session.cam && session.cam.getMediaStreamTrack?.()?.readyState !== 'ended';
    if (!live) recover();
  };
  if (cam) {
    try { cam.on('track-ended', onCamEnded); } catch {}
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onVisibility);
  session.recoveryHandlers = { onCamEnded, onVisibility };

  const localStream = buildLocalStream(session);
  const streamId = streamIdFor(channel, userId);

  const leave = async () => {
    try { client.off('user-published', onPublished); } catch {}
    try { client.off('user-unpublished', onUnpublished); } catch {}
    try { client.off('user-left', onUserLeft); } catch {}
    try { client.off('connection-state-change', onConnState); } catch {}
    if (session.recoveryHandlers) {
      try { document.removeEventListener('visibilitychange', session.recoveryHandlers.onVisibility); } catch {}
      try { window.removeEventListener('focus', session.recoveryHandlers.onVisibility); } catch {}
      session.recoveryHandlers = null;
    }
    try { if (toPublish.length) await client.unpublish(toPublish); } catch {}
    try { session.cam?.stop(); } catch {}
    try { session.mic?.stop(); } catch {}
    try { session.cam?.close(); } catch {}
    try { session.mic?.close(); } catch {}
    // Playback mode keeps a hidden <video> + a canvas-draw loop
    // alive; stop the loop and tear the element down so it doesn't
    // keep decoding (and burning CPU) after the call.
    if (session.playbackEl) {
      try { session.playbackEl.__playbackCropStop?.(); } catch {}
      try { session.playbackEl.pause(); } catch {}
      try { session.playbackEl.remove(); } catch {}
      session.playbackEl = null;
    }
    session.mic = null;
    session.cam = null;
    session.remoteStreams.clear();
    try { await client.leave(); } catch {}
    sessions.delete(channel);
  };

  return { localStream, streamId, leave };
}

/**
 * Hard refresh of the local media on the current side — closes the
 * current local tracks, creates fresh ones, replaces the published
 * pair. The Agora client + channel stay alive so the remote doesn't
 * have to re-join.
 *
 * Same contract as zego.republishLocalMedia, so the call site can
 * just keep calling it.
 */
export async function republishLocalMedia({
  callId,
  userId,
  callType = 'video',
  oldStream: _oldStream,
  oldStreamId: _oldStreamId,
  playLocalInto,
}) {
  const channel = String(callId);
  const session = sessions.get(channel);
  if (!session) {
    throw new Error('agora.republishLocalMedia: no active session for ' + channel);
  }

  const old = [session.mic, session.cam].filter(Boolean);
  try { if (old.length) await session.client.unpublish(old); } catch {}
  try { session.cam?.stop(); } catch {}
  try { session.mic?.stop(); } catch {}
  try { session.mic?.close(); } catch {}
  try { session.cam?.close(); } catch {}
  session.mic = null;
  session.cam = null;

  const { mic, cam } = await createLocalTracks(callType);
  session.mic = mic;
  session.cam = cam;
  // Re-render the preview into the local element so the camera
  // shows again after a stuck-camera recovery.
  if (playLocalInto && cam) {
    try { cam.play(playLocalInto, { fit: 'cover', mirror: false }); } catch {}
  }
  // Re-attach the track-ended watcher to the new cam track so the
  // auto-recovery loop keeps firing if the camera gets yanked again.
  if (cam && session.recoveryHandlers?.onCamEnded) {
    try { cam.on('track-ended', session.recoveryHandlers.onCamEnded); } catch {}
  }
  const fresh = [mic, cam].filter(Boolean);
  if (fresh.length) await session.client.publish(fresh);

  return {
    localStream: buildLocalStream(session),
    streamId: streamIdFor(channel, userId),
  };
}

// ---- helpers -------------------------------------------------------

async function createLocalTracks(callType) {
  if (callType === 'audio') {
    const mic = await AgoraRTC.createMicrophoneAudioTrack();
    return { mic, cam: null };
  }
  const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
  return { mic, cam };
}

// Wrap the Agora local tracks in a real MediaStream so the consumer
// can do `videoEl.srcObject = stream` and it Just Works in all
// browsers. We don't use Agora's own play() for the local preview —
// the existing UI already wires the <video> element via srcObject.
function buildLocalStream({ mic, cam }) {
  const ms = new MediaStream();
  if (cam) {
    try { ms.addTrack(cam.getMediaStreamTrack()); } catch {}
  }
  if (mic) {
    try { ms.addTrack(mic.getMediaStreamTrack()); } catch {}
  }
  return ms;
}

/**
 * Create a (mic, custom video) pair where the video stream comes
 * from a pre-recorded clip looped on a hidden `<video>` element via
 * `captureStream()`. The mic is normal `getUserMedia` so the creator
 * can still talk over the loop.
 *
 * Browser quirks:
 *   - The <video> must be attached to the DOM and *play* before
 *     captureStream() can produce frames. We make it 1×1 px and
 *     visually hidden but technically visible (not display:none —
 *     hidden video stops decoding on some browsers).
 *   - Loop is set so the call doesn't suddenly cut to black after
 *     the clip ends.
 *   - We mute the playback element on our end (`videoEl.muted = true`)
 *     so the creator's local mic isn't fighting with the clip's
 *     audio track. The outgoing audio is the creator's live mic only.
 */
async function createPlaybackTracks(playbackUrl) {
  // 1. Hidden offscreen <video>. position:fixed so it can be sized
  //    1×1 without disturbing layout; opacity 0 + pointer-events
  //    none so it's truly invisible.
  const el = document.createElement('video');
  el.src = playbackUrl;
  el.loop = true;
  el.muted = true; // never play the clip's audio locally
  el.playsInline = true;
  el.autoplay = true;
  el.crossOrigin = 'anonymous'; // R2/CDN — needs CORS to captureStream
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  document.body.appendChild(el);

  // Wait for the video to actually start producing frames. Browsers
  // need at least `loadeddata` AND a successful play() before
  // captureStream's video track is live.
  await new Promise((resolve, reject) => {
    const onReady = () => { el.removeEventListener('loadeddata', onReady); resolve(); };
    el.addEventListener('loadeddata', onReady);
    el.addEventListener('error', () => reject(new Error('Could not load playback video')));
  });
  try { await el.play(); } catch (e) {
    // Some browsers block autoplay even on a muted video; force it
    // by re-attempting after a microtask. If it still fails we
    // bubble up so the caller can fall back to camera.
    await new Promise((r) => setTimeout(r, 0));
    await el.play();
  }

  // 2. Pipe the video through a hidden canvas so we can crop the
  //    bottom 100 px BEFORE captureStream — that way the receiving
  //    side never sees the chopped pixels (e.g. a watermark / footer
  //    burnt into the clip). Without this, an `object-fit: cover` /
  //    CSS-only crop only hides the bottom on our side; the caller
  //    still gets the full frame.
  const CROP_BOTTOM_PX = 100;
  const vw = el.videoWidth || 720;
  const vh = el.videoHeight || 1280;
  const cropH = Math.max(1, vh - CROP_BOTTOM_PX);
  const canvas = document.createElement('canvas');
  canvas.width = vw;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');

  // Steady 30fps redraw via setInterval. Tried
  // `requestVideoFrameCallback` first but it stopped firing after
  // the first second (browser throttling the hidden element / Safari
  // not honouring the spec), freezing the canvas stream on the last
  // drawn frame. setInterval doesn't care whether the source video
  // emitted a new frame — it just redraws whatever's currently
  // displayed in the <video> element. If the video is paused, the
  // canvas keeps publishing the same frame, which is harmless. If
  // the video plays, the canvas keeps up automatically.
  let cropping = true;
  const drawIntervalId = setInterval(() => {
    if (!cropping) return;
    try {
      ctx.drawImage(el, 0, 0, vw, cropH, 0, 0, vw, cropH);
    } catch {
      /* element may not be ready for a frame yet — next tick will
         retry without throwing */
    }
  }, 33); // ~30fps

  // Defensive: if the looped `<video>` ever pauses (some browsers
  // pause on loop seek), kick it back into play. Without this the
  // canvas keeps drawing the last frame and the caller sees a
  // freeze even though our draw loop is still ticking.
  el.addEventListener('pause', () => {
    if (cropping) el.play().catch(() => {});
  });

  // 3. captureStream() from the CANVAS, not the video. 30fps is a
  //    good default for talking-head clips — bumping higher just
  //    burns bandwidth.
  if (typeof canvas.captureStream !== 'function') {
    throw new Error('canvas.captureStream() is unsupported in this browser');
  }
  const captured = canvas.captureStream(30);
  const videoTrack = captured.getVideoTracks()[0];
  if (!videoTrack) throw new Error('Playback canvas has no video track');

  // 4. Mic from getUserMedia (audio only). Real-time mic so the
  //    creator can still talk over the loop.
  const mic = await AgoraRTC.createMicrophoneAudioTrack();

  // 5. Wrap the raw MediaStreamTrack as an Agora custom video track.
  const cam = await AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: videoTrack });

  // Stash the stop hook so leave() can halt the draw loop and let
  // the GC reclaim the canvas + element.
  el.__playbackCropStop = () => {
    cropping = false;
    try { clearInterval(drawIntervalId); } catch {}
  };

  return { mic, cam, playbackEl: el };
}
