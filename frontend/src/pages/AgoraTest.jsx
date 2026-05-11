import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Mic, MicOff, Video, VideoOff, PhoneOff, LogIn, ArrowLeft } from 'lucide-react';
import { api } from '../services/api.js';

/**
 * Sandbox page for testing Agora RTC end-to-end, parallel to the
 * existing custom-WebRTC / Zego call paths.
 *
 * Flow:
 *   1. User types a channel name (any string both peers share).
 *   2. Click Join → frontend calls /agora/token, gets an AppID + token,
 *      creates an AgoraRTC client, joins the channel, publishes mic+cam.
 *   3. Remote users auto-publish on join → `user-published` fires →
 *      we subscribe + render their video into a tile.
 *   4. Click Leave → unpublish, leave channel, stop local tracks.
 *
 * No app billing / call invite plumbing here on purpose — this is the
 * media-layer test surface. Once we confirm Agora works for both peers,
 * we'll graft it into Call.jsx / IncomingCall.jsx replacing the
 * existing peer-connection logic.
 */

// Channel-mode pick — 'rtc' is two-way (calls), 'live' is host/audience
// (livestream). We're always 'rtc' for now.
const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

export default function AgoraTest() {
  const [channel, setChannel] = useState('callnade-test');
  const [status, setStatus] = useState('idle'); // idle | joining | joined | leaving | error
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState([]);

  const localTracksRef = useRef({ mic: null, cam: null });
  const localVideoRef = useRef(null);

  // --- remote user lifecycle --------------------------------------
  useEffect(() => {
    // Subscribe to incoming media — `user-published` fires whenever a
    // remote peer publishes a track. We subscribe and then play it
    // into a per-user video div (set when the tile renders).
    const onUserPublished = async (user, mediaType) => {
      try {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') {
          setRemoteUsers((prev) => upsertUser(prev, user));
          // play() needs a DOM element; deferred to the render phase
          // by setting a ref on the tile and re-playing in an effect.
          requestAnimationFrame(() => {
            const el = document.getElementById(`agora-remote-${user.uid}`);
            if (el) user.videoTrack?.play(el);
          });
        }
        if (mediaType === 'audio') {
          user.audioTrack?.play();
          setRemoteUsers((prev) => upsertUser(prev, user));
        }
      } catch (err) {
        console.warn('agora subscribe failed', err);
      }
    };
    const onUserUnpublished = (user, mediaType) => {
      if (mediaType === 'video') {
        // Keep them in the list (they may publish again) — just stop
        // showing their video tile if no track is left.
        setRemoteUsers((prev) => upsertUser(prev, user));
      }
    };
    const onUserLeft = (user) => {
      setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
    };
    client.on('user-published', onUserPublished);
    client.on('user-unpublished', onUserUnpublished);
    client.on('user-left', onUserLeft);
    return () => {
      client.off('user-published', onUserPublished);
      client.off('user-unpublished', onUserUnpublished);
      client.off('user-left', onUserLeft);
    };
  }, []);

  // --- join / leave -----------------------------------------------
  const join = async () => {
    if (status === 'joining' || status === 'joined') return;
    setError(null);
    setStatus('joining');
    try {
      const { data } = await api.get('/agora/token', { params: { channel } });
      await client.join(data.appId, data.channel, data.token, data.uid);

      // Create mic + cam tracks. createMicrophoneAndCameraTracks
      // requests both permissions in one prompt and returns them in
      // [audio, video] order.
      const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localTracksRef.current = { mic, cam };
      // Play local preview before publish so the user sees themselves
      // immediately, even on a slow uplink.
      if (localVideoRef.current) cam.play(localVideoRef.current);
      await client.publish([mic, cam]);
      setStatus('joined');
    } catch (err) {
      setError(err?.message || 'Failed to join Agora channel.');
      setStatus('error');
      try {
        const { mic, cam } = localTracksRef.current;
        mic?.close();
        cam?.close();
      } catch {}
      localTracksRef.current = { mic: null, cam: null };
    }
  };

  const leave = async () => {
    if (status === 'idle' || status === 'leaving') return;
    setStatus('leaving');
    try {
      const { mic, cam } = localTracksRef.current;
      try { mic?.close(); } catch {}
      try { cam?.close(); } catch {}
      localTracksRef.current = { mic: null, cam: null };
      await client.leave();
      setRemoteUsers([]);
      setMuted(false);
      setCameraOff(false);
    } finally {
      setStatus('idle');
    }
  };

  useEffect(() => () => { leave(); /* on unmount */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- controls ---------------------------------------------------
  const toggleMute = async () => {
    const mic = localTracksRef.current.mic;
    if (!mic) return;
    await mic.setEnabled(muted); // setEnabled(true) un-mutes
    setMuted(!muted);
  };
  const toggleCamera = async () => {
    const cam = localTracksRef.current.cam;
    if (!cam) return;
    await cam.setEnabled(cameraOff); // setEnabled(true) un-disables
    setCameraOff(!cameraOff);
  };

  const isLive = status === 'joined';

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white"
        >
          <ArrowLeft size={16} /> Home
        </Link>
        <h1 className="font-semibold text-sm tracking-tight text-white/90">
          Agora RTC sandbox
        </h1>
        <span
          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            isLive ? 'bg-emerald-500/20 text-emerald-300' :
            status === 'joining' ? 'bg-amber-500/20 text-amber-300' :
            status === 'error' ? 'bg-rose-500/20 text-rose-300' :
            'bg-white/10 text-white/60'
          }`}
        >
          {status}
        </span>
      </header>

      {/* Join controls */}
      {!isLive && (
        <div className="px-4 py-5 flex flex-col gap-3 max-w-md mx-auto w-full">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-white/70">
              Channel name
            </span>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              disabled={status === 'joining'}
              placeholder="any-shared-string"
              className="px-4 py-2.5 rounded-full bg-white/10 border border-white/20 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50"
            />
            <small className="text-[11px] text-white/50">
              Both peers must enter the same channel name.
            </small>
          </label>
          <button
            type="button"
            onClick={join}
            disabled={status === 'joining' || !channel.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-emerald-500 text-white font-semibold disabled:opacity-50 hover:brightness-110 active:translate-y-[1px] transition"
          >
            <LogIn size={16} />
            {status === 'joining' ? 'Joining…' : 'Join channel'}
          </button>
          {error && (
            <div role="alert" className="rounded-2xl bg-rose-500/15 border border-rose-400/30 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Tiles */}
      {isLive && (
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 min-h-0">
          {/* Local */}
          <Tile label="You" videoOff={cameraOff} muted={muted}>
            <div ref={localVideoRef} className="absolute inset-0" />
          </Tile>

          {remoteUsers.length === 0 ? (
            <Tile label="Waiting for peer…">
              <div className="absolute inset-0 grid place-items-center text-white/40 text-xs">
                Share the channel name with the other side.
              </div>
            </Tile>
          ) : (
            remoteUsers.map((u) => (
              <Tile key={u.uid} label={`Peer ${u.uid}`} videoOff={!u.videoTrack}>
                <div id={`agora-remote-${u.uid}`} className="absolute inset-0" />
              </Tile>
            ))
          )}
        </div>
      )}

      {/* Bottom controls — only while in a channel */}
      {isLive && (
        <div className="flex items-center justify-center gap-4 p-4 border-t border-white/10">
          <CtlBtn
            onClick={toggleMute}
            active={muted}
            ariaLabel={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
          </CtlBtn>
          <button
            type="button"
            onClick={leave}
            aria-label="Leave channel"
            className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 grid place-items-center shadow-lg shadow-rose-700/40 active:scale-95 transition"
          >
            <PhoneOff size={22} strokeWidth={2.4} />
          </button>
          <CtlBtn
            onClick={toggleCamera}
            active={cameraOff}
            ariaLabel={cameraOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {cameraOff ? <VideoOff size={18} /> : <Video size={18} />}
          </CtlBtn>
        </div>
      )}
    </div>
  );
}

function Tile({ label, videoOff = false, muted = false, children }) {
  return (
    <div className="relative aspect-video min-h-[200px] rounded-2xl overflow-hidden bg-neutral-800 border border-white/10">
      {children}
      {videoOff && (
        <div className="absolute inset-0 grid place-items-center text-white/40 bg-neutral-900/80">
          <VideoOff size={28} />
        </div>
      )}
      <div className="absolute left-2.5 bottom-2.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-[11px] font-medium">
        {muted && (
          <span className="w-4 h-4 rounded-full bg-rose-600 grid place-items-center">
            <MicOff size={9} strokeWidth={2.6} />
          </span>
        )}
        {label}
      </div>
    </div>
  );
}

function CtlBtn({ children, onClick, active, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={ariaLabel}
      className={`w-12 h-12 rounded-full grid place-items-center transition active:scale-95 ${
        active
          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-700/40'
          : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
      }`}
    >
      {children}
    </button>
  );
}

// Insert-or-update the user record in our remote list. Agora hands us
// the same user object across events; cloning ensures React picks up
// the change and re-renders the tile.
function upsertUser(list, user) {
  const idx = list.findIndex((u) => u.uid === user.uid);
  if (idx === -1) return [...list, user];
  const next = list.slice();
  next[idx] = user;
  return next;
}
