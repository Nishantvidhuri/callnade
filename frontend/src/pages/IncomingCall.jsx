import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getSocket } from '../services/socket.js';
import { joinAndPublish, republishLocalMedia } from '../services/zego.js';
import { useAuthStore } from '../stores/auth.store.js';
import { exitFullscreen } from '../utils/fullscreen.js';
import { CallShell } from './Call.jsx';

/**
 * Creator-side call screen — joins the Zego room as the answerer.
 * The lifecycle is driven by callnade's existing socket events
 * (call:incoming → user clicked Accept → call:accept → call:ended).
 * Media transport is fully handled by Zego: we just publish our
 * camera/mic and wait for the caller's stream via roomStreamUpdate.
 */
export default function IncomingCall() {
  const { callId } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const localVideo = useRef();
  const remoteVideo = useRef();
  const localStreamRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [earnRate] = useState(loc.state?.earnRate || 0);
  const [billRate] = useState(loc.state?.billRate || 0);
  const [earned, setEarned] = useState(0);
  const [callerBalance, setCallerBalance] = useState(loc.state?.callerBalance || 0);
  const [callType] = useState(loc.state?.callType === 'audio' ? 'audio' : 'video');
  const [callerLabel] = useState(loc.state?.callerLabel || null);
  // Live handle to the Zego republish helper for the controls row.
  const refreshRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    let zegoSession = null;

    const cleanup = async () => {
      if (zegoSession) {
        const session = zegoSession;
        zegoSession = null;
        try { await session.leave(); } catch {}
      }
      localStreamRef.current = null;
    };

    const join = async () => {
      const me = useAuthStore.getState().user;
      if (!me?._id) return;
      try {
        const session = await joinAndPublish({
          callId,
          userId: me._id,
          callType,
          onRemoteStream: (stream) => {
            if (remoteVideo.current) remoteVideo.current.srcObject = stream;
            setStatus('connected');
          },
          onRoomState: (reason) => {
            if (reason === 'KICKOUT' || reason === 'TOKEN_EXPIRED') {
              setError('Connection lost.');
            }
          },
        });
        if (cancelled) {
          await session.leave();
          return;
        }
        zegoSession = session;
        localStreamRef.current = session.localStream;
        if (localVideo.current) localVideo.current.srcObject = session.localStream;
      } catch (err) {
        setError(err.message || 'Failed to join call');
      }
    };

    refreshRef.current = async () => {
      if (!zegoSession) return;
      const me = useAuthStore.getState().user;
      if (!me?._id) return;
      try {
        const fresh = await republishLocalMedia({
          callId,
          userId: me._id,
          callType,
          oldStream: zegoSession.localStream,
          oldStreamId: zegoSession.streamId,
        });
        zegoSession.localStream = fresh.localStream;
        zegoSession.streamId = fresh.streamId;
        localStreamRef.current = fresh.localStream;
        if (localVideo.current) localVideo.current.srcObject = fresh.localStream;
      } catch {
        /* user can hit refresh again */
      }
    };

    socket.on('call:earned', ({ callId: id, totalEarned, callerBalance }) => {
      if (id !== callId) return;
      if (typeof totalEarned === 'number') setEarned(totalEarned);
      if (typeof callerBalance === 'number') setCallerBalance(callerBalance);
    });

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

    join();

    return () => {
      cancelled = true;
      socket.off('call:earned');
      socket.off('call:ended');
      socket.off('call:rejected');
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
