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

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    const spectatorPcs = new Map();

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
        const stream = await getLocalStream();
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        localStreamRef.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;

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

    socket.on('call:earned', ({ callId: id, totalEarned, callerBalance }) => {
      if (id !== callId) return;
      if (typeof totalEarned === 'number') setEarned(totalEarned);
      if (typeof callerBalance === 'number') setCallerBalance(callerBalance);
    });

    socket.on('call:ended', () => {
      setStatus('ended');
      cleanup();
      setTimeout(() => nav(-1), 1200);
    });
    socket.on('call:rejected', () => {
      setStatus('ended');
      cleanup();
      setTimeout(() => nav(-1), 1200);
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
      socket.off('call:earned');
      socket.off('call:ended');
      socket.off('call:rejected');
      socket.off('admin:spectator-arrived', onAdminJoin);
      socket.emit('call:hangup', { callId });
      cleanup();
      exitFullscreen();
    };
  }, [callId]);

  const hangup = () => {
    getSocket().emit('call:hangup', { callId });
    nav(-1);
  };

  return (
    <CallShell
      status={status}
      error={error}
      localVideo={localVideo}
      remoteVideo={remoteVideo}
      localStreamRef={localStreamRef}
      onHangup={hangup}
      earnRate={earnRate}
      earned={earned}
      callerBalance={callerBalance}
      callerBillRate={billRate}
    />
  );
}
