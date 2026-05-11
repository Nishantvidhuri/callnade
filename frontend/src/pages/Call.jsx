import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PhoneOff, Mic, MicOff, Video, VideoOff, Wallet, Maximize2, Minimize2,
  RefreshCw,
} from 'lucide-react';
import { getSocket } from '../services/socket.js';
import { joinAndPublish, republishLocalMedia } from '../services/zego.js';
import { exitFullscreen } from '../utils/fullscreen.js';
import { useAuthStore } from '../stores/auth.store.js';

const STATUS_LABEL = {
  starting: 'Starting…',
  ringing: 'Ringing',
  connecting: 'Connecting',
  connected: 'Connected',
  rejected: 'Call declined',
  ended: 'Call ended',
};

export default function Call() {
  const { peerId } = useParams();
  const [params] = useSearchParams();
  const packageId = params.get('package');
  // 'audio' or 'video'. Default 'video' for backwards compat.
  const callType = params.get('type') === 'audio' ? 'audio' : 'video';
  // For the audio-call hero — falls back to '?' if not provided.
  const peerLabel = params.get('peer') || null;
  const nav = useNavigate();
  const localVideo = useRef();
  const remoteVideo = useRef();
  const localStreamRef = useRef(null);
  const callIdRef = useRef(null);
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState(null);
  const [perMinuteRate, setPerMinuteRate] = useState(0);
  const [billed, setBilled] = useState(0);
  // Manual "refresh video" handle — populated inside the setup
  // effect with the live Zego republish closure so the controls
  // row can trigger it from outside the effect's scope.
  const refreshRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let zegoSession = null; // { localStream, streamId, leave }
    const socket = getSocket();

    const cleanup = async () => {
      if (zegoSession) {
        const session = zegoSession;
        zegoSession = null;
        try { await session.leave(); } catch {}
      }
      localStreamRef.current = null;
    };

    // Join the Zego room + publish our camera/mic. Called once the
    // server confirms `call:accepted`. Zego internally handles ICE,
    // transport, reconnect, and bitrate adaptation — none of which
    // we have to plumb ourselves anymore. The remote stream lands in
    // `onRemoteStream` and we wire it to the remote <video>.
    const joinMedia = async () => {
      if (cancelled || !callIdRef.current) return;
      const me = useAuthStore.getState().user;
      if (!me?._id) return;
      try {
        const session = await joinAndPublish({
          callId: callIdRef.current,
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

    // Refresh button — re-publish the local stream without leaving
    // the room. Covers the "camera stuck" cases that used to require
    // a full ICE-restart with our hand-rolled WebRTC; Zego handles
    // the rest.
    refreshRef.current = async () => {
      if (!zegoSession || !callIdRef.current) return;
      const me = useAuthStore.getState().user;
      if (!me?._id) return;
      try {
        const fresh = await republishLocalMedia({
          callId: callIdRef.current,
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

    const start = () => {
      socket.emit(
        'call:invite',
        { toUserId: peerId, packageId: packageId || undefined, callType },
        (ack) => {
          if (ack?.code === 'INSUFFICIENT_CREDITS') {
            setError(
              `Not enough credits — need ${ack.required}, you have ${ack.balance}.`,
            );
            setTimeout(() => nav(-1), 2500);
            return;
          }
          if (ack?.error) {
            setError(ack.error);
            return;
          }
          if (ack.perMinuteRate) setPerMinuteRate(ack.perMinuteRate);
          callIdRef.current = ack.callId;
          setStatus('ringing');
        },
      );
    };

    socket.on('call:accepted', ({ callId }) => {
      if (callId !== callIdRef.current) return;
      setStatus('connecting');
      joinMedia();
    });

    socket.on('call:billed', ({ callId, totalBilled, walletBalance }) => {
      if (callId !== callIdRef.current) return;
      setBilled(totalBilled);
      const me = useAuthStore.getState().user;
      if (me) useAuthStore.getState().setUser({ ...me, walletBalance });
    });

    socket.on('call:rejected', () => {
      setStatus('rejected');
      cleanup();
      setTimeout(() => nav('/', { replace: true }), 1500);
    });
    socket.on('call:ended', () => {
      setStatus('ended');
      cleanup();
      setTimeout(() => nav('/', { replace: true }), 1200);
    });

    start();

    return () => {
      cancelled = true;
      socket.off('call:accepted');
      socket.off('call:billed');
      socket.off('call:rejected');
      socket.off('call:ended');
      refreshRef.current = null;
      if (callIdRef.current) socket.emit('call:hangup', { callId: callIdRef.current });
      cleanup();
      exitFullscreen();
    };
  }, [peerId]);

  const hangup = () => {
    const socket = getSocket();
    if (callIdRef.current) socket.emit('call:hangup', { callId: callIdRef.current });
    // Always go to home (not back). Avoids closing the tab when /call/:id
    // was the entry point, and gives the user a consistent landing.
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
      perMinuteRate={perMinuteRate}
      billed={billed}
      callType={callType}
      peerLabel={peerLabel}
    />
  );
}

export function CallShell({ status, error, localVideo, remoteVideo, localStreamRef, onHangup, onRefresh, perMinuteRate = 0, billed = 0, earnRate = 0, earned = 0, callerBalance = null, callerBillRate = 0, callType = 'video', peerLabel = null }) {
  const isAudio = callType === 'audio';
  // Duration timer — starts ticking when status becomes 'connected'.
  // We tick at 250ms (and store elapsed as a fractional number of seconds)
  // so the billing pill updates smoothly inside each second.
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);
  useEffect(() => {
    if (status !== 'connected') return;
    if (!startRef.current) startRef.current = Date.now();
    const tick = () => setElapsed((Date.now() - startRef.current) / 1000);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status]);

  const me = useAuthStore((s) => s.user);
  const walletBalance = me?.walletBalance ?? 0;

  // Auto-end the call the moment the live balance hits 0 — don't wait for the
  // next server billing tick.
  const endedRef = useRef(false);
  useEffect(() => {
    if (endedRef.current) return;
    if (status !== 'connected' || perMinuteRate <= 0) return;
    const live = perMinuteRate * (elapsed / 60);
    const extra = Math.max(0, live - billed);
    const displayed = walletBalance - extra;
    if (displayed <= 0) {
      endedRef.current = true;
      onHangup?.();
    }
  }, [elapsed, walletBalance, status, perMinuteRate, billed, onHangup]);

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );

  // Track fullscreen state across native API + manual toggles. The
  // browser fires `fullscreenchange` on the document for both
  // user-initiated (Esc) and programmatic exits, so we just listen
  // and mirror the state.
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const rootRef = useRef(null);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await rootRef.current?.requestFullscreen?.();
      }
    } catch {
      /* user denied or unsupported — fail quiet */
    }
  };

  // Outgoing-ringtone — plays on the caller side while we're waiting
  // for the callee to pick up. Stops the moment status flips off
  // 'ringing' / 'starting' (connected, ended, rejected, error). The
  // file ships from public/audio/call.mp3 so it's served at the
  // build root with cache-friendly hashing.
  const ringRef = useRef(null);
  useEffect(() => {
    if (!ringRef.current) return;
    const isWaiting = status === 'ringing' || status === 'starting';
    if (isWaiting) {
      ringRef.current.loop = true;
      ringRef.current.volume = 0.55;
      // play() may reject on iOS until the user gestures — a short
      // catch keeps it from blowing up the call setup.
      ringRef.current.play().catch(() => {});
    } else {
      try {
        ringRef.current.pause();
        ringRef.current.currentTime = 0;
      } catch {}
    }
  }, [status]);

  const toggleMute = () => {
    const track = localStreamRef?.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const toggleCamera = () => {
    const track = localStreamRef?.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  };

  // Pre-connection: show the user's selfie (local preview) full-screen
  // while waiting for the callee to pick up — there's no remote video
  // yet, so making the page-spanning element be the local stream gives
  // the caller something to look at and lets them check their hair /
  // lighting before the other side joins.
  const showLocalAsHero = !isAudio && status !== 'connected';

  return (
    <div
      ref={rootRef}
      className="h-[100dvh] bg-neutral-950 text-white flex flex-col overflow-hidden relative"
    >
      {/* Outgoing ringtone — invisible audio element. Loop is set
          imperatively on play. */}
      <audio ref={ringRef} src="/audio/call.mp3" preload="auto" className="hidden" />
      {/* Fullscreen toggle — top-right, clear of the iPhone notch.
          Native Fullscreen API; on iOS Safari this falls back to
          element fullscreen which is what we want anyway. The track
          for current state lives in the parent so the icon flips
          correctly even when Esc fires the change. */}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        className="absolute z-20 w-10 h-10 grid place-items-center rounded-full bg-black hover:bg-neutral-900 active:scale-95 transition shadow-lg"
        style={{
          top: 'max(env(safe-area-inset-top), 14px)',
          right: 'max(env(safe-area-inset-right), 14px)',
        }}
      >
        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>

      {/* Status pill — centered top, clear of the iPhone notch. */}
      <div
        className="absolute z-10 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur text-xs font-medium whitespace-nowrap"
        style={{ top: 'max(env(safe-area-inset-top), 14px)' }}
      >
        <span>{error ? `Error: ${error}` : STATUS_LABEL[status] || status}</span>
        {status === 'connected' && (
          <>
            <span className="text-white/40">·</span>
            <span className="tabular-nums">{formatDuration(elapsed)}</span>
          </>
        )}
      </div>

      {/* Billing / earnings pill area — below the status pill on phones
          (centered), at top-right on tablets and up. */}
      <div
        className="absolute z-10 flex flex-col items-center sm:items-end gap-1.5 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-5"
        style={{ top: 'calc(max(env(safe-area-inset-top), 14px) + 44px)' }}
      >
        {perMinuteRate > 0 && (
          <BillingPill
            status={status}
            elapsed={elapsed}
            perMinuteRate={perMinuteRate}
            serverBilled={billed}
            walletBalance={walletBalance}
          />
        )}

        {earnRate > 0 && (
          <EarningsPill
            status={status}
            elapsed={elapsed}
            earnRate={earnRate}
            serverEarned={earned}
            earningsBalance={me?.earningsBalance ?? 0}
            callerBalance={callerBalance}
            callerBillRate={callerBillRate}
          />
        )}
      </div>

      <div className="relative flex-1 bg-neutral-900 min-h-0">
        {isAudio ? (
          <>
            {/* Remote audio — invisible <audio> element plays the peer's voice. */}
            <audio ref={remoteVideo} autoPlay playsInline className="hidden" />

            {/* Audio-call hero: peer avatar + label centered. No camera output. */}
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <span className="absolute inset-0 -m-3 rounded-full bg-tinder/30 animate-ping" />
                  <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-tinder grid place-items-center text-white text-4xl sm:text-5xl font-bold shadow-2xl shadow-tinder/40">
                    {(peerLabel || '?').charAt(0).toUpperCase()}
                  </div>
                </div>
                <p className="text-lg sm:text-xl font-semibold text-white/95">
                  {peerLabel || 'Audio call'}
                </p>
                <p className="text-sm text-white/60">
                  {status === 'connected' ? 'Voice connected' : 'Audio call'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Remote feed — always mounted so we can attach the track
                as soon as it arrives. Hidden behind the local hero
                while we're waiting; un-hides on connected. No mirror
                transforms anywhere — both peers see each other's
                streams in their natural orientation. */}
            <video
              ref={remoteVideo}
              autoPlay
              playsInline
              className={`absolute inset-0 w-full h-full object-cover sm:object-contain bg-neutral-900 ${
                showLocalAsHero ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            />

            {showLocalAsHero ? (
              // Pre-connect hero — full-screen self preview while ringing.
              <video
                ref={localVideo}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover bg-neutral-900"
              />
            ) : (
              // Connected — local moves to a corner PIP.
              <div
                className="absolute right-3 sm:right-5 w-20 sm:w-32 lg:w-40 aspect-[3/4] rounded-2xl overflow-hidden border-2 border-white/40 shadow-xl bg-neutral-800"
                style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 96px)' }}
              >
                <video
                  ref={localVideo}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition ${cameraOff ? 'opacity-0' : 'opacity-100'}`}
                />
                {cameraOff && (
                  <div className="absolute inset-0 grid place-items-center text-white/70">
                    <VideoOff size={18} />
                  </div>
                )}
                {muted && (
                  <div className="absolute top-1 left-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-rose-600 grid place-items-center shadow">
                    <MicOff size={10} strokeWidth={2.5} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls — gap shrinks on phones to fit small viewports, and the
          row sits clear of the iPhone home indicator via safe-area-inset. */}
      <div
        className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-3 sm:gap-5"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
      >
        <ControlBtn onClick={toggleMute} active={muted} ariaLabel={muted ? 'Unmute' : 'Mute'}>
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </ControlBtn>

        {/* Refresh video — manual unstick. Re-runs getUserMedia
            locally and signals the remote to do the same, covering
            cases where either camera froze and the auto-recovery
            (visibilitychange / track.onended) didn't fire. */}
        {onRefresh && (
          <ControlBtn
            onClick={() => onRefresh()}
            ariaLabel="Refresh video"
            title="Refresh video on both sides"
          >
            <RefreshCw size={20} />
          </ControlBtn>
        )}

        <button
          onClick={onHangup}
          aria-label="Hang up"
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 transition grid place-items-center shadow-2xl shadow-rose-700/40"
        >
          <PhoneOff size={24} strokeWidth={2.4} />
        </button>

        {/* Camera toggle hidden on audio calls — there's no video to toggle. */}
        {!isAudio && (
          <ControlBtn onClick={toggleCamera} active={cameraOff} ariaLabel={cameraOff ? 'Turn camera on' : 'Turn camera off'}>
            {cameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </ControlBtn>
        )}
      </div>
    </div>
  );
}

function BillingPill({ status, elapsed, perMinuteRate, serverBilled, walletBalance = 0 }) {
  // Smooth, per-second estimate of total billed since the call connected.
  const live = status === 'connected' ? perMinuteRate * (elapsed / 60) : 0;
  const billed = Math.max(live, serverBilled || 0);

  // Server bills every minute. Between ticks, show the user a falling balance.
  const extra = Math.max(0, billed - (serverBilled || 0));
  const displayedBalance = Math.max(0, walletBalance - extra);

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 backdrop-blur border border-emerald-300/30 text-emerald-200 text-[11px] sm:text-xs font-semibold tabular-nums whitespace-nowrap">
      <Wallet size={12} />
      <span>{perMinuteRate.toFixed(1)}/min</span>
      <span className="text-white/40">·</span>
      <span>{billed.toFixed(1)} billed</span>
      <span className="text-white/40">·</span>
      <span className={displayedBalance < perMinuteRate ? 'text-rose-300' : 'text-emerald-200'}>
        {displayedBalance.toFixed(1)} left
      </span>
    </div>
  );
}

function EarningsPill({
  status,
  elapsed,
  earnRate,
  serverEarned,
  earningsBalance = 0,
  callerBalance = null,
  callerBillRate = 0,
}) {
  const live = status === 'connected' ? earnRate * (elapsed / 60) : 0;
  const earned = Math.max(live, serverEarned || 0);
  const extra = Math.max(0, earned - (serverEarned || 0));
  const displayedEarnings = earningsBalance + extra;

  // Smooth caller balance between server billing ticks.
  // Mirrors how BillingPill does it on the caller side:
  //   - `live` is the client's running estimate of total credits billed
  //     since the call connected.
  //   - `serverBilledOnCaller` is the server-confirmed equivalent
  //     (derived from serverEarned, since billRate ≈ earnRate × 1.2).
  //   - The display = last server-confirmed callerBalance, minus whatever
  //     extra the client thinks has been billed since the last server tick.
  let displayedCaller = null;
  if (typeof callerBalance === 'number') {
    if (status === 'connected' && callerBillRate > 0 && earnRate > 0) {
      const live = callerBillRate * (elapsed / 60);
      const serverBilledOnCaller = (serverEarned || 0) * (callerBillRate / earnRate);
      const extra = Math.max(0, live - serverBilledOnCaller);
      displayedCaller = Math.max(0, callerBalance - extra);
    } else {
      displayedCaller = callerBalance;
    }
  }
  const minutesLeft =
    displayedCaller != null && callerBillRate > 0 ? displayedCaller / callerBillRate : null;
  const lowOnCredits = minutesLeft != null && minutesLeft < 1;

  return (
    <div className="flex flex-col items-center sm:items-end gap-1.5">
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 backdrop-blur border border-amber-300/30 text-amber-200 text-[11px] sm:text-xs font-semibold tabular-nums whitespace-nowrap">
        <Wallet size={12} />
        <span>+{earnRate.toFixed(1)}/min</span>
        <span className="text-white/40">·</span>
        <span>{earned.toFixed(1)} earned</span>
        <span className="text-white/40">·</span>
        <span className="text-amber-100">{displayedEarnings.toFixed(1)} total</span>
      </div>

      {displayedCaller != null && (
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur border text-[11px] sm:text-xs font-semibold tabular-nums whitespace-nowrap ${
            lowOnCredits
              ? 'bg-rose-500/20 border-rose-300/40 text-rose-100'
              : 'bg-white/10 border-white/20 text-white/80'
          }`}
          title="Caller's remaining wallet credits"
        >
          <Wallet size={12} />
          <span>caller: {displayedCaller.toFixed(1)} credits</span>
          {minutesLeft != null && (
            <>
              <span className="text-white/40">·</span>
              <span>{minutesLeft.toFixed(1)} min left</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(sec) {
  const s = Math.max(0, sec | 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function ControlBtn({ children, onClick, active, ariaLabel, title }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title || ariaLabel}
      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full grid place-items-center transition active:scale-95 ${
        active
          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-700/40'
          : 'bg-white/15 hover:bg-white/25 backdrop-blur text-white border border-white/20'
      }`}
    >
      {children}
    </button>
  );
}
