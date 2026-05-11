import { ZegoExpressEngine } from 'zego-express-engine-webrtc';
import { api } from './api.js';

/**
 * Thin wrapper around Zego Express SDK for callnade's 1:1 video
 * calling. The engine is a process-wide singleton; we keep one
 * instance and reuse it across calls (Zego's docs recommend this —
 * creating one per call leaks WebRTC peer connections).
 *
 * Conventions:
 *   roomID    = the callnade callId (one room per call)
 *   userID    = the user's MongoDB _id (string)
 *   streamID  = `${callId}_${userId}` — deterministic so the peer can
 *               compute it locally instead of waiting for an event.
 *
 * The Zego layer handles ALL media transport. callnade's existing
 * socket events still drive the call lifecycle (invite, accept,
 * hangup) and billing — only the media plane moves to Zego.
 */

let engine = null;
let cachedAppId = null;
let cachedServer = null;

const ZEGO_APP_ID = Number(import.meta.env.VITE_ZEGO_APP_ID || 0);
// Web SDK server URL. Primary; SDK has its own backup logic. If
// VITE_ZEGO_SERVER is set we use that, otherwise we derive it from
// the appID (Zego's convention is webliveroom<appID>-api.coolzcloud.com).
const ZEGO_SERVER =
  import.meta.env.VITE_ZEGO_SERVER ||
  (ZEGO_APP_ID ? `wss://webliveroom${ZEGO_APP_ID}-api.coolzcloud.com/ws` : '');

function getEngine() {
  if (engine && cachedAppId === ZEGO_APP_ID && cachedServer === ZEGO_SERVER) {
    return engine;
  }
  if (!ZEGO_APP_ID || !ZEGO_SERVER) {
    throw new Error(
      'Zego not configured — set VITE_ZEGO_APP_ID in frontend/.env.local',
    );
  }
  engine = new ZegoExpressEngine(ZEGO_APP_ID, ZEGO_SERVER);
  cachedAppId = ZEGO_APP_ID;
  cachedServer = ZEGO_SERVER;
  // Mute the SDK's verbose internal logging in dev — too chatty.
  try { engine.setLogConfig?.({ logLevel: 'warn' }); } catch {}
  // One-liner marker so it's obvious in the browser console which
  // engine the call is running on. Search the console for "engine"
  // to confirm.
  // eslint-disable-next-line no-console
  console.log(
    `%c🎥 Call engine: ZegoCloud Express SDK%c — appID=${ZEGO_APP_ID} server=${ZEGO_SERVER}`,
    'color:#ec4899;font-weight:bold',
    'color:#999',
  );
  return engine;
}

/** Fetch a per-user, per-room token from our backend. */
export async function fetchZegoToken(roomId) {
  const { data } = await api.get('/zego/token', { params: { room: roomId } });
  return data; // { appId, userId, token, roomId, expiresInSec }
}

export function streamIdFor(callId, userId) {
  return `${callId}_${userId}`;
}

/**
 * Join a Zego room and publish the local camera/mic. Returns the
 * local MediaStream so the caller can attach it to a <video> element
 * and a `leave()` callback for teardown. Subscribing to the remote
 * stream is wired via the onRemoteStream callback.
 *
 *   await joinAndPublish({
 *     callId, userId, callType, onRemoteStream(stream, streamID),
 *     onRoomState(state)
 *   })
 */
export async function joinAndPublish({
  callId,
  userId,
  callType = 'video',
  onRemoteStream,
  onRoomState,
}) {
  if (!callId || !userId) throw new Error('zego.joinAndPublish: missing args');
  const eng = getEngine();
  const { token } = await fetchZegoToken(callId);

  // ---- event wiring (idempotent — Zego allows multiple `.on` so we
  //      rely on logoutRoom + offAll to clean up at leave-time)
  const handlers = {
    roomStreamUpdate: async (roomId, updateType, streamList) => {
      if (roomId !== String(callId)) return;
      if (updateType === 'ADD') {
        for (const s of streamList) {
          try {
            const remote = await eng.startPlayingStream(s.streamID);
            onRemoteStream?.(remote, s.streamID);
          } catch (err) {
            // log + carry on; user can hit "Refresh" to retry
            // eslint-disable-next-line no-console
            console.warn('zego: startPlayingStream failed', err);
          }
        }
      } else if (updateType === 'DELETE') {
        for (const s of streamList) {
          try { eng.stopPlayingStream(s.streamID); } catch {}
        }
      }
    },
    roomStateChanged: (roomId, reason) => {
      if (roomId !== String(callId)) return;
      onRoomState?.(reason);
    },
  };
  eng.on('roomStreamUpdate', handlers.roomStreamUpdate);
  eng.on('roomStateChanged', handlers.roomStateChanged);

  // ---- login + publish
  await eng.loginRoom(
    String(callId),
    token,
    { userID: String(userId), userName: String(userId) },
    { userUpdate: true },
  );

  const localStream = await eng.createStream({
    camera: {
      video: callType === 'video',
      audio: true,
    },
  });
  const streamId = streamIdFor(callId, userId);
  await eng.startPublishingStream(streamId, localStream);

  // teardown helper used by Call.jsx on hangup
  const leave = async () => {
    try { eng.off('roomStreamUpdate', handlers.roomStreamUpdate); } catch {}
    try { eng.off('roomStateChanged', handlers.roomStateChanged); } catch {}
    try { eng.stopPublishingStream(streamId); } catch {}
    try { eng.destroyStream(localStream); } catch {}
    try { await eng.logoutRoom(String(callId)); } catch {}
  };

  return { localStream, streamId, leave };
}

/**
 * Hard refresh of the media on the current side — kills the
 * current local stream, creates a new one, re-publishes. Used by
 * the Refresh-Video button when the camera or peer connection is
 * stuck. The signaling/room stays alive so the remote doesn't have
 * to re-join.
 */
export async function republishLocalMedia({
  callId,
  userId,
  callType = 'video',
  oldStream,
  oldStreamId,
}) {
  const eng = getEngine();
  try { eng.stopPublishingStream(oldStreamId); } catch {}
  try { eng.destroyStream(oldStream); } catch {}

  const fresh = await eng.createStream({
    camera: { video: callType === 'video', audio: true },
  });
  const newStreamId = streamIdFor(callId, userId);
  await eng.startPublishingStream(newStreamId, fresh);
  return { localStream: fresh, streamId: newStreamId };
}
