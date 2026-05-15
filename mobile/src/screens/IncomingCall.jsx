import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { RTCView } from 'react-native-webrtc';
import { useAuthStore } from '../stores/auth.store.js';
import { useIncomingCallsStore } from '../stores/incomingCalls.store.js';
import { getSocket } from '../services/socket.js';
import {
  fetchIceConfig, createPeer, getLocalStream, tuneSenders, openSpectatorPc,
} from '../services/webrtc.js';
import { startCallAudio, stopCallAudio } from '../services/audioRoute.js';
import { theme } from '../theme.js';

const STATUS_LABEL = {
  connecting: 'Connecting…',
  connected: 'Connected',
  ended: 'Call ended',
};

/**
 * Creator-side / answerer screen.
 *
 * Pushed from the Calls tab when the creator taps Accept on a
 * ringing call card. The actual `call:accept` is emitted from the
 * Calls tab before navigation so the caller's UI flips to
 * "connecting" immediately; here we just open the camera, build a
 * peer connection, and wait for the caller's SDP offer.
 *
 * Wiring mirrors frontend/src/pages/IncomingCall.jsx — same socket
 * events, same handshake order.
 */
export default function IncomingCall({ route, navigation }) {
  const setUser = useAuthStore((s) => s.setUser);

  const me = useAuthStore((s) => s.user);

  const {
    callId,
    callType = 'video',
    callerLabel,
    earnRate: earnRateParam = 0,
    billRate: billRateParam = 0,
    callerBalance: callerBalanceParam = null,
  } = route.params || {};

  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [serverEarned, setServerEarned] = useState(0);
  const [callerBalance, setCallerBalance] = useState(callerBalanceParam);
  const [elapsed, setElapsed] = useState(0);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const startedAtRef = useRef(null);

  // Smooth tick once connected, mirrors the caller side.
  useEffect(() => {
    if (status !== 'connected') return;
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    const tick = () => setElapsed((Date.now() - startedAtRef.current) / 1000);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (!callId) {
      setError('Missing call id');
      return undefined;
    }

    const socket = getSocket();
    let cancelled = false;
    const spectatorPcs = new Map(); // adminId → handle

    // Route audio to the loudspeaker for the duration of the call.
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

    // Admin moderation joining mid-call. Push our existing tracks to
    // them via a send-only PC. Same flow as the caller side.
    const onAdminJoin = async ({ callId: id, adminId }) => {
      if (id !== callId) return;
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
      } catch {
        /* non-fatal */
      }
    };

    const setup = async () => {
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
          if (e.streams && e.streams[0]) setRemoteStream(e.streams[0]);
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('rtc:ice', { callId, candidate: e.candidate });
          }
        };

        // Tell the caller we're ready to receive their offer.
        socket.emit('rtc:ready', { callId });
      } catch (e) {
        if (!cancelled) setError(e.message || 'Setup failed');
      }
    };

    const onOffer = async ({ callId: id, sdp }) => {
      if (id !== callId) return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('rtc:answer', { callId, sdp: answer });
        tuneSenders(pc).catch(() => {});
        setStatus('connected');
      } catch (e) {
        setError(e.message || 'Failed to answer');
      }
    };
    const onIce = async ({ callId: id, candidate }) => {
      if (id !== callId) return;
      try { await pcRef.current?.addIceCandidate(candidate); } catch {}
    };
    const onEnded = ({ callId: id }) => {
      if (id !== callId) return;
      setStatus('ended');
      cleanup();
      useIncomingCallsStore.getState().remove(callId);
      setTimeout(() => navigation.replace('CallsTab'), 1100);
    };
    const onEarned = ({ callId: id, totalEarned, earningsBalance, callerBalance: cb }) => {
      if (id !== callId) return;
      if (typeof totalEarned === 'number') setServerEarned(totalEarned);
      if (typeof cb === 'number') setCallerBalance(cb);
      const u = useAuthStore.getState().user;
      if (u && typeof earningsBalance === 'number') {
        setUser({ ...u, earningsBalance });
      }
    };

    socket.on('rtc:offer', onOffer);
    socket.on('rtc:ice', onIce);
    socket.on('call:ended', onEnded);
    socket.on('call:rejected', onEnded);
    socket.on('call:earned', onEarned);
    socket.on('admin:spectator-arrived', onAdminJoin);

    setup();

    return () => {
      cancelled = true;
      try { socket.emit('call:hangup', { callId }); } catch {}
      socket.off('rtc:offer', onOffer);
      socket.off('rtc:ice', onIce);
      socket.off('call:ended', onEnded);
      socket.off('call:rejected', onEnded);
      socket.off('call:earned', onEarned);
      socket.off('admin:spectator-arrived', onAdminJoin);
      stopCallAudio();
      cleanup();
    };
  }, [callId, callType]);

  const hangup = () => {
    const socket = getSocket();
    if (callId) {
      try { socket.emit('call:hangup', { callId }); } catch {}
    }
    useIncomingCallsStore.getState().remove(callId);
    navigation.goBack();
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.statusPill}>
        <Text style={styles.statusText}>
          {error ? `Error: ${error}` : STATUS_LABEL[status] || status}
        </Text>
      </View>

      {/* Earnings telemetry — live earn rate, total earned this call,
          updated wallet total, and (optionally) the caller's remaining
          balance so the creator can pace the conversation. */}
      {earnRateParam > 0 && (
        <View style={styles.earningsWrap}>
          <EarningsPill
            status={status}
            elapsed={elapsed}
            earnRate={earnRateParam}
            serverEarned={serverEarned}
            earningsBalance={me?.earningsBalance ?? 0}
            callerBalance={callerBalance}
            callerBillRate={billRateParam}
          />
        </View>
      )}

      <View style={styles.stage}>
        {isAudio ? (
          <View style={styles.audioHero}>
            <View style={styles.audioRingOuter}>
              <View style={styles.audioRingInner}>
                <Text style={styles.audioInitial}>
                  {(callerLabel || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.audioName}>{callerLabel || 'Audio call'}</Text>
            <Text style={styles.audioStatus}>{STATUS_LABEL[status] || status}</Text>
          </View>
        ) : (
          <>
            {remoteStream ? (
              <RTCView
                streamURL={remoteStream.toURL()}
                style={styles.remoteVideo}
                objectFit="cover"
                mirror={false}
              />
            ) : (
              <View style={styles.placeholder}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
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
          </>
        )}
      </View>

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
    <Pressable onPress={onPress} style={[styles.ctlBtn, active && styles.ctlBtnActive]}>
      <Feather name={icon} size={20} color="#fff" />
    </Pressable>
  );
}

/**
 * Creator-side live earnings pill. Mirrors frontend's EarningsPill:
 * +rate/min · earned this call · running earnings total. When we
 * know the caller's wallet balance and bill rate, a secondary
 * "caller has X" pill renders underneath so the creator can warn
 * the user before credits run out.
 */
function EarningsPill({ status, elapsed, earnRate, serverEarned, earningsBalance, callerBalance, callerBillRate }) {
  const live = status === 'connected' ? earnRate * (elapsed / 60) : 0;
  const earned = Math.max(live, serverEarned || 0);
  const extra = Math.max(0, earned - (serverEarned || 0));
  const total = (earningsBalance || 0) + extra;

  let displayedCaller = null;
  if (typeof callerBalance === 'number') {
    if (status === 'connected' && callerBillRate > 0 && earnRate > 0) {
      const liveBilled = callerBillRate * (elapsed / 60);
      const serverBilledOnCaller = (serverEarned || 0) * (callerBillRate / earnRate);
      const extraBilled = Math.max(0, liveBilled - serverBilledOnCaller);
      displayedCaller = Math.max(0, callerBalance - extraBilled);
    } else {
      displayedCaller = callerBalance;
    }
  }
  const minutesLeft =
    displayedCaller != null && callerBillRate > 0 ? displayedCaller / callerBillRate : null;
  const low = minutesLeft != null && minutesLeft < 1;

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={earnStyles.wrap}>
        <Feather name="trending-up" size={12} color="#fde68a" />
        <Text style={earnStyles.text}>+{earnRate.toFixed(1)}/min</Text>
        <Text style={earnStyles.sep}>·</Text>
        <Text style={earnStyles.text}>{earned.toFixed(1)} earned</Text>
        <Text style={earnStyles.sep}>·</Text>
        <Text style={earnStyles.text}>{total.toFixed(1)} total</Text>
      </View>

      {displayedCaller != null && (
        <View style={[earnStyles.callerWrap, low && earnStyles.callerLow]}>
          <Feather name="user" size={11} color={low ? '#fecdd3' : 'rgba(255,255,255,0.85)'} />
          <Text style={[earnStyles.callerText, low && earnStyles.callerLowText]}>
            Caller {displayedCaller.toFixed(1)}{minutesLeft != null ? ` · ~${Math.max(0, minutesLeft).toFixed(1)}m left` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

const earnStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderWidth: 1, borderColor: 'rgba(252,211,77,0.4)',
  },
  text: { color: '#fde68a', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sep: { color: 'rgba(255,255,255,0.4)' },
  callerWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  callerLow: { backgroundColor: 'rgba(244,63,94,0.22)', borderColor: 'rgba(252,165,165,0.4)' },
  callerText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  callerLowText: { color: '#fecdd3' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  statusPill: {
    position: 'absolute', top: 14, alignSelf: 'center',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)', zIndex: 10,
  },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  earningsWrap: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    zIndex: 10,
  },

  stage: { flex: 1, position: 'relative' },
  remoteVideo: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0a0a0a' },
  placeholder: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
  },
  pip: {
    position: 'absolute', right: 14, bottom: 120,
    width: 110, height: 150,
    borderRadius: theme.radius.lg, overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.5)', borderWidth: 2,
    backgroundColor: '#262626',
  },
  pipOverlay: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pipMuted: {
    position: 'absolute', top: 6, left: 6,
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 20, paddingVertical: 18, paddingBottom: 28,
  },
  ctlBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctlBtnActive: { backgroundColor: '#e11d48', borderColor: '#e11d48' },
  hangBtn: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#e11d48',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#e11d48',
    shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
