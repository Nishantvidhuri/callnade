import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Wallet } from 'lucide-react';
import { getSocket } from '../services/socket.js';
import { joinAndPublish } from '../services/agora.js';
import { useAuthStore } from '../stores/auth.store.js';
import { exitFullscreen } from '../utils/fullscreen.js';

/**
 * Creator-side multi-call screen — holds N concurrent Agora sessions
 * side by side. Each session is independent:
 *   - own Agora channel (channel name = the call's callId)
 *   - own local mic + cam / playback track pair
 *   - own remote tile, billing timer, earnings counter
 *   - own hangup button (ends just that call; the rest keep going)
 *
 * Per-caller playback resume (the +20s rule) is unchanged — agora.js
 * reads / writes `callnade:playback-progress:<creator>:<caller>` from
 * inside createPlaybackTracks, so every session has an independent
 * timeline that "continues" only for repeat callers.
 *
 * The current callId in the URL params seeds the first session.
 * Any subsequent `call:accept` from /calls navigates back here with
 * an additional `?add=<callId>` param, which is folded into the
 * sessions array on mount.
 *
 * Cap: we limit to 4 concurrent sessions to keep mobile CPU sane.
 */

const MAX_SESSIONS = 4;

const PLAYBACK_CROPS = {
  pooja:  { top: 0,   bottom: 100 },
  meera:  { top: 100, bottom: 100 },
  ishita: { top: 100, bottom: 100 },
};

export default function MultiCall() {
  const [params] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const me = useAuthStore((s) => s.user);

  // Sessions are kept in a Map keyed by callId so concurrent
  // mutations from different socket events don't fight over array
  // indices. Each value is the rendered descriptor below.
  const [sessions, setSessions] = useState(() => initialSessionsFromParams(params, loc));
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // Per-session Agora handles + DOM refs. Kept outside the rendered
  // state so leave/refresh don't trigger React re-renders.
  const handlesRef = useRef(new Map()); // callId -> { agoraSession, remoteVideoEl }

  const upsertSession = useCallback((callId, patch) => {
    setSessions((prev) => {
      const next = new Map(prev);
      const cur = next.get(callId) || {};
      next.set(callId, { ...cur, callId, ...patch });
      return next;
    });
  }, []);

  const removeSession = useCallback((callId) => {
    setSessions((prev) => {
      if (!prev.has(callId)) return prev;
      const next = new Map(prev);
      next.delete(callId);
      return next;
    });
    const handle = handlesRef.current.get(callId);
    if (handle?.agoraSession) {
      handle.agoraSession.leave().catch(() => {});
    }
    handlesRef.current.delete(callId);
  }, []);

  // Bring a single session online: join Agora, publish, render to a
  // tile element. Idempotent — re-running is a no-op if we already
  // have a handle for that callId.
  const startSession = useCallback(async (s) => {
    if (handlesRef.current.has(s.callId)) return;
    handlesRef.current.set(s.callId, { agoraSession: null });
    const remoteEl = document.getElementById(`mc-remote-${s.callId}`);
    try {
      const username = me?.username;
      const usePlayback = !!me?.usePlaybackVideo && s.callType === 'video' && username;
      const playbackVideoUrl = usePlayback ? `/playback/${username}.mp4` : undefined;
      const crop = usePlayback ? (PLAYBACK_CROPS[username] || {}) : {};
      const session = await joinAndPublish({
        callId: s.callId,
        userId: me._id,
        callType: s.callType,
        playRemoteInto: remoteEl || undefined,
        playbackVideoUrl,
        playbackCropTop: crop.top || 0,
        playbackCropBottom: crop.bottom || 0,
        // Per-caller resume — independent timeline per (creator,caller).
        playbackProgressKey:
          usePlayback && s.callerLabel
            ? `callnade:playback-progress:${username}:${s.callerLabel}`
            : null,
        playbackResumeOffsetSec: 20,
        onRemoteStream: () => {
          upsertSession(s.callId, {
            status: 'connected',
            connectedAt: Date.now(),
          });
        },
        onRoomState: () => {},
      });
      handlesRef.current.set(s.callId, { agoraSession: session });
    } catch (err) {
      upsertSession(s.callId, { status: 'ended', error: err.message || 'Failed to join' });
      handlesRef.current.delete(s.callId);
    }
  }, [me, upsertSession]);

  // Mount: kick off sessions for every seeded callId. We intentionally
  // only depend on the *set of callIds* — calling startSession is
  // idempotent so re-running for the same id is harmless.
  useEffect(() => {
    if (!me?._id) return;
    for (const s of sessions.values()) {
      if (s.callId) startSession(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?._id, Array.from(sessions.keys()).join(',')]);

  // Socket — billing ticks, call ended, and incoming new calls
  // (auto-accepted so the creator doesn't have to bounce out to
  // /calls and back).
  useEffect(() => {
    const socket = getSocket();

    const onEarned = ({ callId, totalEarned, callerBalance: cb }) => {
      const s = sessionsRef.current.get(callId);
      if (!s) return;
      upsertSession(callId, {
        earned: typeof totalEarned === 'number' ? totalEarned : s.earned,
        callerBalance: typeof cb === 'number' ? cb : s.callerBalance,
      });
    };
    const onEnded = ({ callId }) => {
      removeSession(callId);
    };
    const onRejected = ({ callId }) => {
      removeSession(callId);
    };
    const onIncoming = (payload) => {
      // Auto-accept additional incoming calls while we're already on
      // this page — the creator opted into multi-call by being here.
      // Cap at MAX_SESSIONS to keep CPU sane.
      if (sessionsRef.current.size >= MAX_SESSIONS) return;
      const callId = payload?.callId;
      if (!callId || sessionsRef.current.has(callId)) return;
      socket.emit('call:accept', { callId }, (ack) => {
        if (ack?.error) return;
        upsertSession(callId, {
          callId,
          callerLabel: payload.from?.username || null,
          billRate: payload.perMinuteRate || 0,
          earnRate: payload.earnRate || 0,
          callerBalance: payload.callerBalance || 0,
          callType: payload.callType === 'audio' ? 'audio' : 'video',
          status: 'connecting',
          earned: 0,
        });
      });
    };

    socket.on('call:earned', onEarned);
    socket.on('call:ended', onEnded);
    socket.on('call:rejected', onRejected);
    socket.on('call:incoming', onIncoming);
    return () => {
      socket.off('call:earned', onEarned);
      socket.off('call:ended', onEnded);
      socket.off('call:rejected', onRejected);
      socket.off('call:incoming', onIncoming);
    };
  }, [upsertSession, removeSession]);

  // Tick every second so per-session timers re-render.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => (n + 1) & 0xff), 1000);
    return () => clearInterval(id);
  }, []);

  // Hangup one specific call. Others stay live.
  const hangup = (callId) => {
    const socket = getSocket();
    socket.emit('call:hangup', { callId });
    removeSession(callId);
  };

  // Page unmount: hang up every open session.
  useEffect(() => {
    return () => {
      const socket = getSocket();
      for (const id of handlesRef.current.keys()) {
        socket.emit('call:hangup', { callId: id });
      }
      for (const { agoraSession } of handlesRef.current.values()) {
        agoraSession?.leave().catch(() => {});
      }
      handlesRef.current.clear();
      exitFullscreen();
    };
  }, []);

  // Auto-exit when the last session ends.
  useEffect(() => {
    if (sessions.size === 0) {
      const t = setTimeout(() => nav('/', { replace: true }), 600);
      return () => clearTimeout(t);
    }
  }, [sessions.size, nav]);

  const list = Array.from(sessions.values());
  const tileCount = list.length;
  // 1 tile → full screen, 2 → side-by-side, 3-4 → 2×2.
  const gridCols =
    tileCount <= 1 ? 'grid-cols-1' :
    tileCount === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    'grid-cols-2';

  return (
    <div className="h-[100dvh] bg-neutral-950 text-white flex flex-col">
      <header className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="text-xs font-bold tracking-wide text-white/80">
          MULTI-CALL · {tileCount} active{tileCount >= MAX_SESSIONS ? ' (max)' : ''}
        </div>
        <button
          type="button"
          onClick={() => {
            const socket = getSocket();
            for (const id of handlesRef.current.keys()) {
              socket.emit('call:hangup', { callId: id });
            }
            setSessions(new Map());
            handlesRef.current.clear();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-[11px] font-bold transition"
        >
          <PhoneOff size={12} /> End all
        </button>
      </header>

      <div className={`flex-1 min-h-0 grid ${gridCols} gap-1 p-1 bg-black`}>
        {list.map((s) => (
          <CallTile key={s.callId} session={s} onHangup={() => hangup(s.callId)} />
        ))}
        {tileCount === 0 && (
          <div className="grid place-items-center text-white/50 text-sm">
            No active calls.
          </div>
        )}
      </div>
    </div>
  );
}

/** Build the seed Map<callId, session> from the URL on initial mount. */
function initialSessionsFromParams(params, loc) {
  const out = new Map();
  const initial = params.get('callId');
  const state = loc.state || {};
  if (initial) {
    out.set(initial, {
      callId: initial,
      callerLabel: state.callerLabel || null,
      billRate: state.billRate || 0,
      earnRate: state.earnRate || 0,
      earned: 0,
      callerBalance: state.callerBalance || 0,
      callType: state.callType === 'audio' ? 'audio' : 'video',
      status: 'connecting',
    });
  }
  return out;
}

/**
 * One tile in the grid. Owns the per-session timer (independent of
 * other tiles) plus the remote-video element + a small badge with
 * earnings, billing rate, and a hangup button.
 */
function CallTile({ session: s, onHangup }) {
  // Independent elapsed timer per session — based on the local
  // connectedAt timestamp so opening at 10:02 vs 10:12 produces
  // separate counters. The 1s tick in the parent re-renders us.
  const elapsedMs = s.connectedAt ? Date.now() - s.connectedAt : 0;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));

  // Live earned estimate between server ticks — same idea as the
  // single-call screen, scoped to this tile.
  const livePerSec = (s.earnRate || 0) / 60;
  const liveEarned = s.connectedAt && s.earnRate > 0
    ? Math.max(s.earned || 0, livePerSec * elapsedSec)
    : (s.earned || 0);

  return (
    <div className="relative rounded-xl overflow-hidden bg-neutral-900 min-h-0">
      {/* Agora paints into this element via playRemoteInto */}
      <div
        id={`mc-remote-${s.callId}`}
        className="absolute inset-0"
      />

      {/* Status pill */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/55 backdrop-blur text-[10px] font-semibold tracking-wide z-10">
        <span>
          {s.error
            ? `Error: ${s.error}`
            : s.status === 'connected'
              ? 'Connected'
              : 'Connecting'}
        </span>
        {s.connectedAt && (
          <>
            <span className="text-white/40">·</span>
            <span className="tabular-nums">{fmtDuration(elapsedSec)}</span>
          </>
        )}
      </div>

      {/* Top-right caller + earnings */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-[10px] font-bold">
          @{s.callerLabel || '—'}
        </div>
        {s.earnRate > 0 && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/25 border border-amber-300/30 backdrop-blur text-[10px] font-semibold text-amber-100 tabular-nums">
            <Wallet size={9} /> +{s.earnRate.toFixed(1)}/min · {liveEarned.toFixed(1)} earned
          </div>
        )}
      </div>

      {/* Per-tile hangup */}
      <button
        type="button"
        onClick={onHangup}
        aria-label="End this call"
        className="absolute bottom-2 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 grid place-items-center shadow-lg shadow-rose-700/40 z-10"
      >
        <PhoneOff size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function fmtDuration(sec) {
  const s = Math.max(0, sec | 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}
