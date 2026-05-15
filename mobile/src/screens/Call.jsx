import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { useAuthStore } from '../stores/auth.store.js';
import { getSocket } from '../services/socket.js';
import {
  fetchIceConfig, createPeer, getLocalStream, tuneSenders, openSpectatorPc,
} from '../services/webrtc.js';
import { startCallAudio, stopCallAudio } from '../services/audioRoute.js';
import { theme } from '../theme.js';

const STATUS_LABEL = {
  starting: 'Starting…',
  ringing: 'Ringing',
  connecting: 'Connecting',
  connected: 'Connected',
  rejected: 'Call declined',
  ended: 'Call ended',
};

/**
 * Caller-side call screen. Direct port of frontend/src/pages/Call.jsx.
 *
 * Lifecycle:
 *   1. Mount → fetch ICE config, getUserMedia, create RTCPeerConnection.
 *   2. Emit `call:invite` → wait for `call:accepted` (callee picked up).
 *   3. When `rtc:ready` arrives from the callee, send the offer.
 *   4. On `rtc:answer`, set remote description → `connected`.
 *   5. On hangup / billing-zero / peer hangup → cleanup + nav home.
 *
 * Camera-reacquire (track.onended / visibilitychange) and the
 * "Refresh" button that tears down + rebuilds the whole peer
 * connection live on the web today; we're shipping the core call
 * here first and porting those resilience knobs in a follow-up
 * once we've shaken out the mobile-specific bugs.
 */
export default function Call({ route, navigation }) {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const {
    peerId, peerLabel, callType = 'video', packageId,
  } = route.params || {};

  const [status, setStatus] = useState('starting');
  const [error, setError] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  // Live billing telemetry — perMinuteRate arrives in the
  // `call:invite` ack; serverBilled comes from `call:billed` events
  // every billing flush. Elapsed (250ms ticker) drives a smooth
  // per-second balance estimate between flushes.
  const [perMinuteRate, setPerMinuteRate] = useState(0);
  const [serverBilled, setServerBilled] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const callIdRef = useRef(null);
  const calleeAcceptedRef = useRef(false);
  const calleeReadyRef = useRef(false);
  const offerSentRef = useRef(false);
  const startedAtRef = useRef(null);

  // 250ms tick once we're connected — used to interpolate the wallet
  // pill between server billing flushes so the number visibly ticks
  // down each second instead of dropping in 30s steps.
  useEffect(() => {
    if (status !== 'connected') return;
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    const tick = () => setElapsed((Date.now() - startedAtRef.current) / 1000);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    // Per-admin spectator PCs. Each entry is a { pc, cleanup } pair
    // returned by openSpectatorPc. Lets the admin moderation panel
    // silently join the call from any other tab/device.
    const spectatorPcs = new Map(); // adminId -> handle

    // Route audio to the loudspeaker for the duration of the call
    // (default for react-native-webrtc is the earpiece, which is too
    // quiet for video chat). startCallAudio also keeps the screen on.
    startCallAudio({ video: callType === 'video' });

    const cleanup = () => {
      try { pcRef.current?.close(); } catch {}
      pcRef.current = null;
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }
      localStreamRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
      for (const { cleanup: c } of spectatorPcs.values()) c();
      spectatorPcs.clear();
    };

    const trySendOffer = async () => {
      if (offerSentRef.current) return;
      if (!calleeAcceptedRef.current || !calleeReadyRef.current) return;
      if (!pcRef.current || !callIdRef.current) return;
      offerSentRef.current = true;
      try {
        const offer = await pcRef.current.createOffer({});
        await pcRef.current.setLocalDescription(offer);
        socket.emit('rtc:offer', { callId: callIdRef.current, sdp: offer });
        tuneSenders(pcRef.current).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to send offer');
      }
    };

    const start = async () => {
      try {
        const ice = await fetchIceConfig();
        const stream = await getLocalStream({ video: callType === 'video' });
        if (cancelled) {
          stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);

        const pc = createPeer(ice.iceServers);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        pc.ontrack = (e) => {
          // First remote track resolves into the peer's MediaStream.
          if (e.streams && e.streams[0]) setRemoteStream(e.streams[0]);
        };
        pc.onicecandidate = (e) => {
          if (e.candidate && callIdRef.current) {
            socket.emit('rtc:ice', { callId: callIdRef.current, candidate: e.candidate });
          }
        };

        socket.emit(
          'call:invite',
          { toUserId: peerId, packageId: packageId || undefined, callType },
          (ack) => {
            if (cancelled) return;
            if (ack?.code === 'INSUFFICIENT_CREDITS') {
              setError(`Not enough credits — need ${ack.required}, you have ${ack.balance}.`);
              setTimeout(() => navigation.replace('HomeFeed'), 2200);
              return;
            }
            if (ack?.error) {
              setError(ack.error);
              return;
            }
            callIdRef.current = ack.callId;
            if (ack.perMinuteRate) setPerMinuteRate(ack.perMinuteRate);
            setStatus('ringing');
          },
        );
      } catch (err) {
        if (!cancelled) setError(err.message || 'Call setup failed');
      }
    };

    const onAccepted = ({ callId }) => {
      if (callId !== callIdRef.current) return;
      calleeAcceptedRef.current = true;
      setStatus('connecting');
      trySendOffer();
    };
    const onReady = ({ callId }) => {
      if (callId !== callIdRef.current) return;
      calleeReadyRef.current = true;
      trySendOffer();
    };
    const onAnswer = async ({ callId, sdp }) => {
      if (callId !== callIdRef.current) return;
      try {
        await pcRef.current?.setRemoteDescription(sdp);
        setStatus('connected');
      } catch (e) {
        setError(e.message || 'Failed to apply answer');
      }
    };
    const onIce = async ({ callId, candidate }) => {
      if (callId !== callIdRef.current) return;
      try { await pcRef.current?.addIceCandidate(candidate); } catch {}
    };
    const onRejected = () => {
      setStatus('rejected');
      cleanup();
      setTimeout(() => navigation.replace('HomeFeed'), 1400);
    };
    const onEnded = () => {
      setStatus('ended');
      cleanup();
      setTimeout(() => navigation.replace('HomeFeed'), 1100);
    };
    // Server-confirmed billing snapshots every flush. wallet:update
    // is handled globally by useWalletSync at the App level — no
    // need to subscribe to that again here.
    const onBilled = ({ callId, totalBilled }) => {
      if (callId !== callIdRef.current) return;
      if (typeof totalBilled === 'number') setServerBilled(totalBilled);
    };

    // Admin moderation joined the call from another tab/device.
    // Reuse our existing local stream — no extra getUserMedia, no
    // visible change to the user. If the same admin re-joins (left
    // and came back) we tear down the stale PC first so the new one
    // gets a fresh offer.
    const onAdminJoin = async ({ callId: id, adminId }) => {
      if (id !== callIdRef.current) return;
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
          callId: id,
          adminId,
        });
        spectatorPcs.set(adminId, handle);
      } catch {
        /* non-fatal — call continues without spectator stream */
      }
    };

    socket.on('call:accepted', onAccepted);
    socket.on('rtc:ready', onReady);
    socket.on('rtc:answer', onAnswer);
    socket.on('rtc:ice', onIce);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    socket.on('call:billed', onBilled);
    socket.on('admin:spectator-arrived', onAdminJoin);

    start();

    return () => {
      cancelled = true;
      if (callIdRef.current) {
        try { socket.emit('call:hangup', { callId: callIdRef.current }); } catch {}
      }
      socket.off('call:accepted', onAccepted);
      socket.off('rtc:ready', onReady);
      socket.off('rtc:answer', onAnswer);
      socket.off('rtc:ice', onIce);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
      socket.off('call:billed', onBilled);
      socket.off('admin:spectator-arrived', onAdminJoin);
      stopCallAudio();
      cleanup();
    };
  }, [peerId, callType, packageId]);

  const hangup = () => {
    const socket = getSocket();
    if (callIdRef.current) {
      try { socket.emit('call:hangup', { callId: callIdRef.current }); } catch {}
    }
    navigation.replace('HomeFeed');
  };

  const toggleMute = () => {
    const t = localStreamRef.current?.getAudioTracks()?.[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMuted(!t.enabled);
  };
  const toggleCamera = () => {
    const t = localStreamRef.current?.getVideoTracks()?.[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCameraOff(!t.enabled);
  };

  const isAudio = callType === 'audio';
  const showLocalHero = !isAudio && status !== 'connected';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Status pill */}
      <View style={styles.statusPill}>
        <Text style={styles.statusText}>
          {error ? `Error: ${error}` : STATUS_LABEL[status] || status}
        </Text>
      </View>

      {/* Live billing pill — only when there's a paid package and a
          confirmed perMinuteRate. */}
      {perMinuteRate > 0 && (
        <View style={styles.billingPill}>
          <BillingPill
            status={status}
            elapsed={elapsed}
            perMinuteRate={perMinuteRate}
            serverBilled={serverBilled}
            walletBalance={me?.walletBalance ?? 0}
          />
        </View>
      )}

      {/* Main stage */}
      <View style={styles.stage}>
        {isAudio ? (
          <View style={styles.audioHero}>
            <View style={styles.audioRingOuter}>
              <View style={styles.audioRingInner}>
                <Text style={styles.audioInitial}>
                  {(peerLabel || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.audioName}>{peerLabel || 'Audio call'}</Text>
            <Text style={styles.audioStatus}>{STATUS_LABEL[status] || status}</Text>
          </View>
        ) : (
          <>
            {/* Remote video — hidden until we're connected so the
                local preview can take the full stage during ringing. */}
            {remoteStream && (
              <RTCView
                streamURL={remoteStream.toURL()}
                style={[styles.remoteVideo, showLocalHero && { opacity: 0 }]}
                objectFit="cover"
                mirror={false}
              />
            )}

            {showLocalHero ? (
              localStream ? (
                <RTCView
                  streamURL={localStream.toURL()}
                  style={styles.localHero}
                  objectFit="cover"
                  mirror={false}
                />
              ) : (
                <View style={styles.placeholder}>
                  <ActivityIndicator color="#fff" />
                </View>
              )
            ) : (
              // PIP — local goes to a corner once we're connected.
              <View style={styles.pip}>
                {localStream ? (
                  <RTCView
                    streamURL={localStream.toURL()}
                    style={{ flex: 1, opacity: cameraOff ? 0 : 1 }}
                    objectFit="cover"
                    mirror={false}
                  />
                ) : null}
                {cameraOff && (
                  <View style={styles.pipOverlay}>
                    <Feather name="video-off" size={18} color="rgba(255,255,255,0.85)" />
                  </View>
                )}
                {muted && (
                  <View style={styles.pipMuted}>
                    <Feather name="mic-off" size={11} color="#fff" />
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <ControlBtn onPress={toggleMute} active={muted} icon={muted ? 'mic-off' : 'mic'} />
        <Pressable onPress={hangup} style={styles.hangBtn}>
          <Feather name="phone-off" size={24} color="#fff" strokeWidth={2.4} />
        </Pressable>
        {!isAudio && (
          <ControlBtn
            onPress={toggleCamera}
            active={cameraOff}
            icon={cameraOff ? 'video-off' : 'video'}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function ControlBtn({ onPress, active, icon }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.ctlBtn, active && styles.ctlBtnActive]}
    >
      <Feather name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

/**
 * Caller-side live billing pill. Matches the web's BillingPill:
 * rate · live-billed · live-remaining. Rate stays static; the other
 * two interpolate per-tick so the user actually sees their credits
 * tick down once a second instead of every flush.
 */
function BillingPill({ status, elapsed, perMinuteRate, serverBilled, walletBalance }) {
  const live = status === 'connected' ? perMinuteRate * (elapsed / 60) : 0;
  const billed = Math.max(live, serverBilled || 0);
  const extra = Math.max(0, billed - (serverBilled || 0));
  const left = Math.max(0, (walletBalance || 0) - extra);
  const low = left < perMinuteRate;
  return (
    <View style={pillStyles.wrap}>
      <Feather name="credit-card" size={12} color="#bbf7d0" />
      <Text style={pillStyles.text}>{perMinuteRate.toFixed(1)}/min</Text>
      <Text style={pillStyles.sep}>·</Text>
      <Text style={pillStyles.text}>{billed.toFixed(1)} billed</Text>
      <Text style={pillStyles.sep}>·</Text>
      <Text style={[pillStyles.text, low && pillStyles.lowText]}>
        {left.toFixed(1)} left
      </Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.35)',
  },
  text: { color: '#bbf7d0', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sep: { color: 'rgba(255,255,255,0.4)' },
  lowText: { color: '#fecdd3' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },

  statusPill: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  billingPill: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    zIndex: 10,
  },

  stage: { flex: 1, position: 'relative' },
  remoteVideo: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0a0a0a' },
  localHero: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0a0a0a' },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pip: {
    position: 'absolute',
    right: 14,
    bottom: 120,
    width: 110,
    height: 150,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 2,
    backgroundColor: '#262626',
  },
  pipOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pipMuted: {
    position: 'absolute',
    top: 6, left: 6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#e11d48',
    alignItems: 'center', justifyContent: 'center',
  },

  audioHero: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  audioRingOuter: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(236,72,153,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  audioRingInner: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: theme.colors.tinder,
    alignItems: 'center', justifyContent: 'center',
  },
  audioInitial: { color: '#fff', fontSize: 56, fontWeight: '700' },
  audioName: { color: '#fff', fontSize: 22, fontWeight: '700' },
  audioStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 18,
    paddingBottom: 28,
  },
  ctlBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctlBtnActive: { backgroundColor: '#e11d48', borderColor: '#e11d48' },
  hangBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#e11d48',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#e11d48',
    shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
