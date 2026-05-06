import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Volume2, VolumeX, AlertTriangle, Sparkles } from 'lucide-react';
import { getSocket } from '../services/socket.js';
import { fetchIceConfig, createPeer } from '../services/webrtc.js';

/**
 * Read-only "monitor" view for admins. Streams ONLY the provider's outgoing
 * video to the admin (not the subscriber's) — the goal is to verify the
 * creator is actually doing the call they're being paid for, not sharing
 * external links / using stand-ins. The other party never knows.
 */
export default function AdminSpectate() {
  const { callId } = useParams();
  const nav = useNavigate();
  const videoRef = useRef(null);
  const pcRef = useRef(null);

  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(true);
  const [streamReady, setStreamReady] = useState(false);
  const [provider, setProvider] = useState(null); // { id, username, displayName, role }
  const providerIdRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    let iceConfig = null;
    // Buffer offers/ICE that arrive before the ack tells us who the provider
    // is — otherwise we'd silently drop the very first offer due to a race.
    const pendingOffers = [];
    const pendingIce = [];

    const cleanup = () => {
      try { pcRef.current?.close(); } catch { /* ignore */ }
      pcRef.current = null;
    };

    const acceptOffer = async ({ fromUserId, sdp }) => {
      if (!iceConfig) iceConfig = await fetchIceConfig();
      let pc = pcRef.current;
      if (!pc) {
        pc = createPeer(iceConfig.iceServers);
        pcRef.current = pc;

        pc.ontrack = (e) => {
          if (videoRef.current) videoRef.current.srcObject = e.streams[0];
          setStreamReady(true);
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('rtc:spec-ice', {
              toUserId: fromUserId,
              callId,
              candidate: e.candidate,
              fromAdmin: true,
            });
          }
        };
      }
      try {
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('rtc:spec-answer', {
          toUserId: fromUserId,
          callId,
          sdp: answer,
        });
      } catch (e) {
        setError(`Negotiation failed: ${e.message}`);
      }
    };

    const flushPending = async () => {
      const pid = providerIdRef.current;
      if (!pid) return;
      while (pendingOffers.length) {
        const o = pendingOffers.shift();
        if (String(o.fromUserId) === String(pid)) await acceptOffer(o);
      }
      while (pendingIce.length) {
        const ice = pendingIce.shift();
        if (String(ice.fromUserId) !== String(pid)) continue;
        const pc = pcRef.current;
        if (pc) try { await pc.addIceCandidate(ice.candidate); } catch { /* ignore */ }
      }
    };

    const handleOffer = async ({ callId: id, fromUserId, sdp }) => {
      if (id !== callId) return;
      if (!providerIdRef.current) {
        // ack hasn't landed yet — queue and process when it does.
        pendingOffers.push({ fromUserId, sdp });
        return;
      }
      if (String(fromUserId) !== String(providerIdRef.current)) return;
      await acceptOffer({ fromUserId, sdp });
    };

    const handleIce = async ({ callId: id, fromUserId, candidate }) => {
      if (id !== callId) return;
      if (!providerIdRef.current) {
        pendingIce.push({ fromUserId, candidate });
        return;
      }
      if (String(fromUserId) !== String(providerIdRef.current)) return;
      const pc = pcRef.current;
      if (!pc) return;
      try { await pc.addIceCandidate(candidate); } catch { /* ignore */ }
    };

    const handleEnded = () => {
      setStatus('ended');
      cleanup();
      setTimeout(() => nav(-1), 1500);
    };

    socket.on('rtc:spec-offer', handleOffer);
    socket.on('rtc:spec-ice', handleIce);
    socket.on('call:ended', handleEnded);

    socket.emit('admin:spectate', { callId }, (ack) => {
      if (ack?.error) {
        setError(ack.error);
        setStatus('failed');
        return;
      }
      providerIdRef.current = ack.providerId;
      setProvider(ack.provider || null);
      setStatus('waiting');
      // Drain any offers/ICE that arrived before the ack.
      flushPending();
    });

    // If no stream is up after 8 seconds, hint that the participants probably
    // need to refresh — the spec listener wasn't loaded in their tabs.
    const timeoutId = setTimeout(() => {
      if (!pcRef.current && !error) {
        setError(
          "No stream from the creator — they may need to refresh their browser to load the latest call code, or the call ended.",
        );
      }
    }, 8000);

    return () => {
      clearTimeout(timeoutId);
      socket.off('rtc:spec-offer', handleOffer);
      socket.off('rtc:spec-ice', handleIce);
      socket.off('call:ended', handleEnded);
      cleanup();
    };
  }, [callId, nav]);

  // Mute toggle controls the playback audio.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, streamReady]);

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-white flex flex-col">
      <header className="px-4 sm:px-6 py-3 flex items-center gap-3 border-b border-white/10 shrink-0">
        <button
          onClick={() => nav(-1)}
          aria-label="Back"
          className="w-9 h-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 transition shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-400" />
            Admin monitor
          </p>
          <p className="text-[11px] text-white/50 truncate">
            Read-only · neither party sees you · call <span className="font-mono opacity-70">{callId}</span>
          </p>
        </div>
        <button
          onClick={() => setMuted((m) => !m)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold transition shrink-0"
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          <span className="hidden sm:inline">{muted ? 'Audio off' : 'Audio on'}</span>
        </button>
      </header>

      {error && (
        <div className="m-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="relative flex-1 min-h-0 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain"
        />

        {/* Provider badge — top-left so the admin always knows whose feed
            they're watching. */}
        {provider && (
          <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-xs font-semibold">
            <Sparkles size={12} className="text-amber-300" />
            <span className="truncate max-w-[180px]">
              {provider.displayName || provider.username || 'Creator'}
            </span>
            {provider.role === 'provider' && (
              <span className="text-[10px] uppercase tracking-wide font-bold text-amber-300/80">
                Creator
              </span>
            )}
            {provider.role !== 'provider' && (
              <span className="text-[10px] uppercase tracking-wide font-bold text-rose-300/80">
                {provider.role || 'callee'}
              </span>
            )}
          </div>
        )}

        {/* Live indicator */}
        <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-[11px] font-bold">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              streamReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          {streamReady ? 'LIVE' : status === 'failed' ? 'FAILED' : 'WAITING'}
        </div>

        {!streamReady && (
          <div className="absolute inset-0 grid place-items-center text-white/60 px-6">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
              <p className="text-sm">
                {status === 'failed' ? 'Could not connect to the call' : 'Waiting for creator stream…'}
              </p>
              <p className="text-[11px] text-white/40 mt-1">
                {status === 'failed' ? '' : 'The provider will join automatically.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
