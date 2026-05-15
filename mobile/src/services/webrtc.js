import {
  RTCPeerConnection,
  mediaDevices,
} from 'react-native-webrtc';
import { api } from './api.js';

/**
 * WebRTC helpers — RN twin of frontend/src/services/webrtc.js. Same
 * API surface so the call screen code reads like the web's:
 *   - fetchIceConfig()       → POST /calls/ice-config (TURN creds)
 *   - createPeer(iceServers) → new RTCPeerConnection
 *   - getLocalStream({video})→ getUserMedia, front camera by default
 *   - tuneSenders(pc)        → cap outbound bitrate so cellular holds up
 */

export async function fetchIceConfig() {
  const { data } = await api.post('/calls/ice-config');
  return data;
}

export function createPeer(iceServers) {
  return new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  });
}

export async function getLocalStream({ video = true } = {}) {
  return mediaDevices.getUserMedia({
    video: video
      ? {
          width: 1280,
          height: 720,
          frameRate: 30,
          facingMode: 'user',
        }
      : false,
    audio: true,
  });
}

/**
 * Send-only RTCPeerConnection to a moderation admin who's spectating
 * this call. The admin doesn't broadcast back — we just push our
 * existing tracks. Mirrors `openSpectatorPc` in
 * frontend/src/services/webrtc.js so admin spectating works
 * identically whether the peer is on web or mobile.
 *
 * Wires up signaling via the supplied socket:
 *   emit  rtc:spec-offer   { adminId, callId, sdp }
 *   emit  rtc:spec-ice     { toUserId: adminId, callId, candidate, fromAdmin: false }
 *   on    rtc:spec-answer  { fromAdminId, sdp }   (filtered to this admin)
 *   on    rtc:spec-ice     { fromUserId, candidate } (filtered to this admin)
 *
 * Returns { pc, cleanup() } so the caller can close it on hangup.
 */
export async function openSpectatorPc({
  iceServers,
  localStream,
  socket,
  callId,
  adminId,
}) {
  const pc = createPeer(iceServers);

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('rtc:spec-ice', {
        toUserId: adminId,
        callId,
        candidate: e.candidate,
        fromAdmin: false,
      });
    }
  };

  const onAnswer = async ({ fromAdminId, sdp }) => {
    if (String(fromAdminId) !== String(adminId)) return;
    try { await pc.setRemoteDescription(sdp); } catch {}
  };
  const onIce = async ({ fromUserId, candidate }) => {
    if (String(fromUserId) !== String(adminId)) return;
    try { await pc.addIceCandidate(candidate); } catch {}
  };
  socket.on('rtc:spec-answer', onAnswer);
  socket.on('rtc:spec-ice', onIce);

  const offer = await pc.createOffer({});
  await pc.setLocalDescription(offer);
  socket.emit('rtc:spec-offer', { adminId, callId, sdp: offer });

  // Cap spectator stream way below the main call so it doesn't
  // visibly degrade the user's outbound bandwidth.
  tuneSenders(pc, { videoBitrate: 500_000, audioBitrate: 32_000 }).catch(() => {});

  return {
    pc,
    cleanup: () => {
      socket.off('rtc:spec-answer', onAnswer);
      socket.off('rtc:spec-ice', onIce);
      try { pc.close(); } catch {}
    },
  };
}

export async function tuneSenders(
  pc,
  { videoBitrate = 1_200_000, audioBitrate = 48_000 } = {},
) {
  // Mobile cellular tops out lower than desktop — cap video at
  // ~1.2 Mbps so it gracefully degrades on weak networks instead
  // of stalling.
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    if (sender.track.kind === 'video') {
      params.encodings[0].maxBitrate = videoBitrate;
      params.encodings[0].maxFramerate = 30;
    } else if (sender.track.kind === 'audio') {
      params.encodings[0].maxBitrate = audioBitrate;
    }
    try { await sender.setParameters(params); } catch { /* ignore */ }
  }
}
