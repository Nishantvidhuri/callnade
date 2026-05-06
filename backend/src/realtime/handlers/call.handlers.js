import { nanoid } from 'nanoid';
import { canMessage } from '../../services/follow.service.js';
import { recordSession } from '../../services/call.service.js';
import { Package } from '../../models/package.model.js';
import { User } from '../../models/user.model.js';
import { logger } from '../../config/logger.js';
import { notifyUser } from '../io.js';
import { subscriberPrice, PLATFORM_MARGIN } from '../../utils/pricing.js';

const calls = new Map();
// callId → { callerId, calleeId, startedAt, connectedAt?, packageId?, perMinuteRate, totalBilled, billInterval? }

const room = (callId) => `call:${callId}`;
const userRoom = (userId) => `user:${userId}`;

// Round to 2 decimals — keeps wallet/earnings clean despite per-minute
// floating-point adds.
const round2 = (n) => Math.round((n || 0) * 100) / 100;

export function getActiveCalls() {
  return Array.from(calls.entries()).map(([callId, c]) => ({
    callId,
    callerId: String(c.callerId),
    calleeId: String(c.calleeId),
    startedAt: c.startedAt,
    connectedAt: c.connectedAt || null,
    state: c.connectedAt ? 'connected' : 'ringing',
    perMinuteRate: c.billRate || 0,
    totalBilled: c.totalBilled || 0,
  }));
}

async function billOnce(io, callId) {
  const c = calls.get(callId);
  if (!c || !c.billRate) return;

  const [caller, callee] = await Promise.all([
    User.findById(c.callerId),
    User.findById(c.calleeId),
  ]);
  if (!caller || !callee) return;

  const billRate = c.billRate; // what caller pays this minute
  const earnRate = c.earnRate; // what creator earns this minute

  if ((caller.walletBalance || 0) < billRate) {
    io.to(room(callId)).emit('call:ended', { callId, reason: 'insufficient_credits' });
    io.to(userRoom(c.callerId)).emit('call:ended', { callId, reason: 'insufficient_credits' });
    io.to(userRoom(c.calleeId)).emit('call:ended', { callId, reason: 'insufficient_credits' });
    await endCall(callId, 'insufficient_credits');
    return;
  }

  // Round to 2 decimals on every billing tick — floating-point math
  // accumulates errors over the course of a call (e.g. 9943.600000000002).
  caller.walletBalance = round2(Math.max(0, (caller.walletBalance || 0) - billRate));
  callee.earningsBalance = round2((callee.earningsBalance || 0) + earnRate);
  c.totalBilled = round2((c.totalBilled || 0) + billRate);
  c.totalEarned = round2((c.totalEarned || 0) + earnRate);
  await Promise.all([caller.save(), callee.save()]);

  notifyUser(c.callerId, 'wallet:update', { walletBalance: caller.walletBalance });
  notifyUser(c.calleeId, 'wallet:update', { earningsBalance: callee.earningsBalance });
  notifyUser(c.callerId, 'call:billed', {
    callId,
    totalBilled: c.totalBilled,
    walletBalance: caller.walletBalance,
  });
  // Tell the creator how much they've earned so far AND how many credits the
  // caller has left, so they can see how soon the call may end on credits.
  notifyUser(c.calleeId, 'call:earned', {
    callId,
    totalEarned: c.totalEarned,
    earningsBalance: callee.earningsBalance,
    callerBalance: caller.walletBalance,
  });
}

async function endCall(callId, reason = 'hangup') {
  const c = calls.get(callId);
  if (!c) return;
  if (c.billInterval) {
    clearInterval(c.billInterval);
    c.billInterval = null;
  }
  const endedAt = new Date();
  const durationSec = c.startedAt
    ? Math.floor((endedAt - new Date(c.startedAt)) / 1000)
    : 0;
  try {
    await recordSession({
      callerId: c.callerId,
      calleeId: c.calleeId,
      packageId: c.packageId || null,
      perMinuteRate: c.billRate || 0,
      totalBilled: c.totalBilled || 0,
      startedAt: c.startedAt,
      endedAt,
      durationSec,
      endReason: reason,
    });
  } catch (err) {
    logger.error({ err, callId }, 'failed to record call session');
  }
  calls.delete(callId);
}

export function registerCallHandlers(io, socket) {
  socket.on('call:invite', async ({ toUserId, packageId }, ack) => {
    try {
      if (!toUserId) return ack?.({ error: 'Missing toUserId' });
      const allowed = await canMessage(socket.user.id, toUserId);
      if (!allowed) return ack?.({ error: 'Not subscribed' });

      let billRate = 0; // what caller pays per minute (creator price + 20%)
      let earnRate = 0; // what creator earns per minute (creator price)
      let pkgId = null;
      if (packageId) {
        const pkg = await Package.findById(packageId).lean();
        if (!pkg || !pkg.active) return ack?.({ error: 'Package not available' });
        if (String(pkg.providerId) !== String(toUserId)) {
          return ack?.({ error: 'Package does not belong to that user' });
        }
        if (!pkg.durationMinutes || pkg.durationMinutes <= 0) {
          return ack?.({ error: 'Package has no duration set' });
        }
        const subscriberTotal = subscriberPrice(pkg.price);
        billRate = subscriberTotal / pkg.durationMinutes;
        earnRate = pkg.price / pkg.durationMinutes;
        pkgId = pkg._id;

        // Caller must have enough credits to cover the full marked-up package price
        const caller = await User.findById(socket.user.id).select('walletBalance').lean();
        const balance = caller?.walletBalance || 0;
        if (balance < subscriberTotal) {
          return ack?.({
            error: 'Not enough credits',
            code: 'INSUFFICIENT_CREDITS',
            required: subscriberTotal,
            balance,
          });
        }
      }

      // Snapshot caller's current balance so we can show it on the creator's
      // call screen ("caller has X credits left").
      const callerSnap = await User.findById(socket.user.id).select('walletBalance').lean();
      const callerBalance = callerSnap?.walletBalance || 0;

      const callId = nanoid(12);
      calls.set(callId, {
        callerId: socket.user.id,
        calleeId: toUserId,
        startedAt: new Date(),
        packageId: pkgId,
        billRate,
        earnRate,
        totalBilled: 0,
        totalEarned: 0,
      });
      socket.join(room(callId));

      io.to(userRoom(toUserId)).emit('call:incoming', {
        callId,
        from: { id: socket.user.id, username: socket.user.username },
        packageId: pkgId ? String(pkgId) : null,
        perMinuteRate: billRate,
        earnRate,
        callerBalance,
      });
      ack?.({ ok: true, callId, perMinuteRate: billRate });
    } catch (err) {
      logger.error({ err }, 'call:invite failed');
      ack?.({ error: 'invite failed' });
    }
  });

  socket.on('call:accept', ({ callId }, ack) => {
    const c = calls.get(callId);
    if (!c || String(c.calleeId) !== String(socket.user.id)) return ack?.({ error: 'invalid' });
    c.connectedAt = new Date();
    socket.join(room(callId));
    io.to(userRoom(c.callerId)).emit('call:accepted', { callId });

    if (c.billRate > 0 && !c.billInterval) {
      c.billInterval = setInterval(() => {
        billOnce(io, callId).catch((err) => logger.error({ err, callId }, 'billing failed'));
      }, 60_000);
    }

    ack?.({ ok: true });
  });

  socket.on('call:reject', async ({ callId }) => {
    const c = calls.get(callId);
    if (!c) return;
    if (String(c.calleeId) !== String(socket.user.id)) return;
    io.to(userRoom(c.callerId)).emit('call:rejected', { callId });
    io.to(userRoom(c.calleeId)).emit('call:rejected', { callId });
    await endCall(callId, 'rejected');
  });

  socket.on('rtc:ready', ({ callId }) => {
    if (!authorizedFor(socket, callId)) return;
    socket.to(room(callId)).emit('rtc:ready', { callId });
  });

  socket.on('rtc:offer', ({ callId, sdp }) => {
    if (!authorizedFor(socket, callId)) return;
    socket.to(room(callId)).emit('rtc:offer', { callId, sdp });
  });

  socket.on('rtc:answer', ({ callId, sdp }) => {
    if (!authorizedFor(socket, callId)) return;
    socket.to(room(callId)).emit('rtc:answer', { callId, sdp });
  });

  socket.on('rtc:ice', ({ callId, candidate }) => {
    if (!authorizedFor(socket, callId)) return;
    socket.to(room(callId)).emit('rtc:ice', { callId, candidate });
  });

  socket.on('call:hangup', async ({ callId }) => {
    const c = calls.get(callId);
    if (!c) return;
    if (![String(c.callerId), String(c.calleeId)].includes(String(socket.user.id))) return;
    io.to(room(callId)).emit('call:ended', { callId });
    io.to(userRoom(c.callerId)).emit('call:ended', { callId });
    io.to(userRoom(c.calleeId)).emit('call:ended', { callId });
    await endCall(callId, 'hangup');
  });

  // ─── Admin spectator (silent moderation join) ────────────────────────────
  // Admins can subscribe to an active call's video feeds without becoming a
  // speaker. The two existing parties open extra send-only RTCPeerConnections
  // targeted at the admin; we route SDP/ICE between them via these events.
  socket.on('admin:spectate', async ({ callId }, ack) => {
    try {
      if (!socket.user?.isAdmin) return ack?.({ error: 'forbidden' });
      const c = calls.get(callId);
      if (!c) return ack?.({ error: 'Call not found' });

      // Look up roles + display info so the admin client can decide which
      // tile to show (we only render the provider's feed).
      const [caller, callee] = await Promise.all([
        User.findById(c.callerId).select('username displayName role').lean(),
        User.findById(c.calleeId).select('username displayName role').lean(),
      ]);
      const providerId =
        callee?.role === 'provider' ? String(c.calleeId)
        : caller?.role === 'provider' ? String(c.callerId)
        : String(c.calleeId); // fallback when neither side is a provider

      // Only ask the provider to push their video to the admin — saves
      // bandwidth and matches the "creator monitoring" use case.
      io.to(userRoom(providerId)).emit('admin:spectator-arrived', {
        callId,
        adminId: socket.user.id,
      });

      ack?.({
        ok: true,
        callerId: String(c.callerId),
        calleeId: String(c.calleeId),
        providerId,
        provider:
          String(providerId) === String(c.callerId) ? {
            id: String(c.callerId),
            username: caller?.username,
            displayName: caller?.displayName,
            role: caller?.role,
          } : {
            id: String(c.calleeId),
            username: callee?.username,
            displayName: callee?.displayName,
            role: callee?.role,
          },
      });
    } catch (err) {
      logger.error({ err }, 'admin:spectate failed');
      ack?.({ error: 'spectate failed' });
    }
  });

  // Party → admin: SDP offer with their outgoing media tracks.
  socket.on('rtc:spec-offer', ({ adminId, callId, sdp }) => {
    if (!authorizedFor(socket, callId)) return;
    io.to(userRoom(adminId)).emit('rtc:spec-offer', {
      callId,
      fromUserId: socket.user.id,
      sdp,
    });
  });

  // Admin → party: SDP answer.
  socket.on('rtc:spec-answer', ({ toUserId, callId, sdp }) => {
    if (!socket.user?.isAdmin) return;
    io.to(userRoom(toUserId)).emit('rtc:spec-answer', {
      callId,
      fromAdminId: socket.user.id,
      sdp,
    });
  });

  // Either direction: ICE candidates between admin and a party.
  socket.on('rtc:spec-ice', ({ toUserId, callId, candidate, fromAdmin }) => {
    if (fromAdmin) {
      if (!socket.user?.isAdmin) return;
    } else if (!authorizedFor(socket, callId)) return;
    io.to(userRoom(toUserId)).emit('rtc:spec-ice', {
      callId,
      fromUserId: socket.user.id,
      candidate,
    });
  });
}

function authorizedFor(socket, callId) {
  const c = calls.get(callId);
  if (!c) return false;
  return [String(c.callerId), String(c.calleeId)].includes(String(socket.user.id));
}
