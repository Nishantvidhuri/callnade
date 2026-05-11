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
      try { user.videoTrack.play(playRemoteInto, { fit: 'cover' }); } catch {}
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
  const { mic, cam } = await createLocalTracks(callType);
  session.mic = mic;
  session.cam = cam;
  if (playLocalInto && cam) {
    try { cam.play(playLocalInto, { fit: 'cover', mirror: false }); } catch {}
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
