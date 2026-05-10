import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getSocket } from '../services/socket.js';
import { fetchIceConfig, createPeer, getLocalStream, tuneSenders, openSpectatorPc } from '../services/webrtc.js';
import { exitFullscreen } from '../utils/fullscreen.js';
import { CallShell } from './Call.jsx';

export default function IncomingCall() {
  const { callId } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const localVideo = useRef();
  const remoteVideo = useRef();
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [earnRate] = useState(loc.state?.earnRate || 0);
  const [billRate] = useState(loc.state?.billRate || 0);
  const [earned, setEarned] = useState(0);
  const [callerBalance, setCallerBalance] = useState(loc.state?.callerBalance || 0);
  const [callType] = useState(loc.state?.callType === 'audio' ? 'audio' : 'video');
  const [callerLabel] = useState(loc.state?.callerLabel || null);
  // Live handle to the camera-reacquire helper; CallShell's refresh
  // button calls this from outside the setup effect's closure.
  const refreshRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    let reacquiring = false;
    const spectatorPcs = new Map();

    // Same camera-recovery helper as Call.jsx — re-runs getUserMedia
    // and `replaceTrack()` on the existing peer connection so a
    // frozen feed (other app grabbed the camera, OS suspended the
    // track) recovers without renegotiation. Triggered automatically
    // by track lifecycle events / visibility changes, AND manually
    // by the new "Refresh video" button on the controls row.
    const reacquireMedia = async () => {
      if (reacquiring || cancelled) return;
      if (!pcRef.current) return;
      reacquiring = true;
      try {
        const fresh = await getLocalStream({ video: callType === 'video' });
        if (cancelled) {
          fresh.getTracks().forEach((t) => t.stop());
          return;
        }
        const senders = pcRef.current.getSenders();
        const newAudio = fresh.getAudioTracks()[0];
        const newVideo = fresh.getVideoTracks()[0];
        if (newAudio) {
          const audioSender = senders.find((s) => s.track && s.track.kind === 'audio');
          if (audioSender) await audioSender.replaceTrack(newAudio);
        }
        if (newVideo) {
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
          if (videoSender) await videoSender.replaceTrack(newVideo);
        }
        localStreamRef.current?.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        localStreamRef.current = fresh;
        if (localVideo.current) localVideo.current.srcObject = fresh;
        attachTrackWatchers(fresh);
      } catch {
        /* camera held by another app or denied — bail; future events retry */
      } finally {
        reacquiring = false;
      }
    };

    const attachTrackWatchers = (stream) => {
      stream.getTracks().forEach((t) => {
        t.onended = () => reacquireMedia();
        t.onunmute = () => reacquireMedia();
      });
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const tracks = localStreamRef.current?.getTracks() || [];
      const dead = tracks.some((t) => t.readyState === 'ended' || t.muted);
      if (dead) reacquireMedia();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    window.addEventListener('focus', onVisibility);

    // Creator-side hard reset: close the existing peer connection,
    // reacquire the camera, build a fresh pc, and wait for the
    // caller's new offer. Used both when WE press refresh (we then
    // emit rtc:refresh so the caller does its hardReset and sends
    // the new offer) and when the CALLER presses refresh (we
    // receive rtc:refresh and need to be ready for their offer).
    let resetting = false;
    const creatorReset = async ({ notifyPeer = false } = {}) => {
      if (cancelled || !callId || resetting) return;
      resetting = true;
      if (notifyPeer) socket.emit('rtc:refresh', { callId });
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      try {
        const fresh = await getLocalStream({ video: callType === 'video' });
        if (cancelled) {
          fresh.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current?.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        localStreamRef.current = fresh;
        if (localVideo.current) localVideo.current.srcObject = fresh;
        attachTrackWatchers(fresh);

        const ice = await fetchIceConfig();
        const pc = createPeer(ice.iceServers);
        pcRef.current = pc;
        fresh.getTracks().forEach((t) => pc.addTrack(t, fresh));
        pc.ontrack = (e) => {
          if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('rtc:ice', { callId, candidate: e.candidate });
        };
        // No offer to send — we're the answerer. The existing
        // rtc:offer listener picks up the caller's new SDP.
      } catch {
        /* user can hit refresh again */
      } finally {
        resetting = false;
      }
    };

    // Refresh button on creator: do our own reset and notify the
    // caller so they tear down too and send a fresh offer.
    refreshRef.current = () => creatorReset({ notifyPeer: true });

    const cleanup = () => {
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      for (const { cleanup } of spectatorPcs.values()) cleanup();
      spectatorPcs.clear();
    };

    const setup = async () => {
      try {
        const ice = await fetchIceConfig();
        const stream = await getLocalStream({ video: callType === 'video' });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        localStreamRef.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        attachTrackWatchers(stream);

        const pc = createPeer(ice.iceServers);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = (e) => {
          if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('rtc:ice', { callId, candidate: e.candidate });
        };

        socket.emit('rtc:ready', { callId });
      } catch (err) {
        setError(err.message);
      }
    };

    socket.on('rtc:offer', async ({ callId: id, sdp }) => {
      if (id !== callId) return;
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('rtc:answer', { callId, sdp: answer });
      tuneSenders(pc).catch(() => {});
      setStatus('connected');
    });

    socket.on('rtc:ice', async ({ callId: id, candidate }) => {
      if (id !== callId) return;
      try { await pcRef.current?.addIceCandidate(candidate); } catch {}
    });

    // Caller pressed Refresh — they're tearing down their pc and
    // sending a fresh offer. We tear down ours too and stand a new
    // pc up to receive their offer.
    socket.on('rtc:refresh', ({ callId: id }) => {
      if (id !== callId) return;
      creatorReset();
    });

    socket.on('call:earned', ({ callId: id, totalEarned, callerBalance }) => {
      if (id !== callId) return;
      if (typeof totalEarned === 'number') setEarned(totalEarned);
      if (typeof callerBalance === 'number') setCallerBalance(callerBalance);
    });

    // Peer hung up / rejected — show the ended pill briefly, then go home.
    // Always nav to '/' so we never accidentally close the tab.
    socket.on('call:ended', () => {
      setStatus('ended');
      cleanup();
      setTimeout(() => nav('/', { replace: true }), 1200);
    });
    socket.on('call:rejected', () => {
      setStatus('ended');
      cleanup();
      setTimeout(() => nav('/', { replace: true }), 1200);
    });

    const onAdminJoin = async ({ callId: id, adminId }) => {
      if (id !== callId) return;
      // Replace any stale spectator PC for this admin (their previous tab
      // closed and they came back). Otherwise the new admin tab hangs on
      // "WAITING" because no fresh offer is ever sent.
      const existing = spectatorPcs.get(adminId);
      if (existing) {
        existing.cleanup();
        spectatorPcs.delete(adminId);
      }
      const stream = localStreamRef.current;
      if (!stream) return;
      try {
        const ice = await fetchIceConfig();
        const handle = await openSpectatorPc({
          iceServers: ice.iceServers,
          localStream: stream,
          socket,
          callId,
          adminId,
        });
        spectatorPcs.set(adminId, handle);
      } catch (e) { /* non-fatal */ }
    };
    socket.on('admin:spectator-arrived', onAdminJoin);

    setup();

    return () => {
      cancelled = true;
      socket.off('rtc:offer');
      socket.off('rtc:ice');
      socket.off('rtc:refresh');
      socket.off('call:earned');
      socket.off('call:ended');
      socket.off('call:rejected');
      socket.off('admin:spectator-arrived', onAdminJoin);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
      window.removeEventListener('focus', onVisibility);
      refreshRef.current = null;
      socket.emit('call:hangup', { callId });
      cleanup();
      exitFullscreen();
    };
  }, [callId]);

  const hangup = () => {
    getSocket().emit('call:hangup', { callId });
    nav('/', { replace: true });
  };

  return (
    <CallShell
      status={status}
      error={error}
      localVideo={localVideo}
      remoteVideo={remoteVideo}
      localStreamRef={localStreamRef}
      onHangup={hangup}
      onRefresh={() => refreshRef.current?.()}
      earnRate={earnRate}
      earned={earned}
      callerBalance={callerBalance}
      callerBillRate={billRate}
      callType={callType}
      peerLabel={callerLabel}
    />
  );
}
