import { nanoid } from 'nanoid';
import { canMessage } from '../../services/follow.service.js';
import { recordSession } from '../../services/call.service.js';
import { Package } from '../../models/package.model.js';
import { User } from '../../models/user.model.js';
import { ReferralPayout } from '../../models/referralPayout.model.js';
import { logger } from '../../config/logger.js';
import { notifyUser } from '../io.js';
import { subscriberPrice, PLATFORM_MARGIN } from '../../utils/pricing.js';
import { WITHDRAW_FEE_RATE_EARNINGS } from '../../services/wallet.service.js';
import {
  setBusy,
  clearBusy,
  broadcastStatus,
} from './presence.handlers.js';

// Creator-referral bonus: when a creator signs up using someone's
// referral code, the referrer earns 10% of that creator's per-call
// earnings — but ONLY for the first 30 days from the creator's
// signup. After the window closes the bonus stops cleanly.
//
// Both numbers are tunable here. The 30-day window is anchored to the
// creator's createdAt (immutable after signup) so the cutoff can't be
// reset by re-saving the user.
const CREATOR_REFERRAL_RATE = 0.1;
const CREATOR_REFERRAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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

// How often unsaved billing is flushed to the DB. The in-memory ticker
// runs every second so the UI feels live, but we batch the writes.
// 30s strikes a balance: bounded loss if the process dies (≤30s of
// billing) without thrashing the DB on every tick.
const FLUSH_INTERVAL_MS = 30_000;

/**
 * Persist whatever's accumulated in `c.unsavedBill` / `c.unsavedEarn`
 * to the DB via atomic `$inc`s, then reset the counters and refresh
 * the cached snapshot.
 *
 * Uses `$inc` (not `findById → modify → save`) for two reasons:
 *   1. Atomic w.r.t. concurrent admin top-ups / debits.
 *   2. Skips Mongoose's full doc validation, which would otherwise
 *      run on every save and tank the throughput.
 */
async function flushBilling(callId) {
  const c = calls.get(callId);
  if (!c) return;
  const bill = c.unsavedBill || 0;
  const earn = c.unsavedEarn || 0;
  if (bill <= 0 && earn <= 0) {
    c.lastFlushAt = Date.now();
    return;
  }
  // Reset counters BEFORE awaiting so re-entrant ticks don't double-flush.
  c.unsavedBill = 0;
  c.unsavedEarn = 0;

  // Creator-referral payout: if the creator was referred AND we're
  // still inside the 30-day bonus window, route 10% of the creator's
  // *net* (post-platform-fee) earnings to the referrer's referral
  // wallet. NET is `earn × (1 − WITHDRAW_FEE_RATE_EARNINGS)` —
  // matching what the creator would actually receive at withdrawal
  // time. So for ₹100 gross, the referrer gets ₹100 × 0.8 × 0.1 = ₹8
  // (not ₹10 off the gross). The DB write is a separate atomic $inc
  // so the creator's ledger is never debited. Window is re-checked
  // on every flush — once it expires mid-call, payouts stop cleanly.
  let creatorReferralCut = 0;
  const referralActive =
    earn > 0 &&
    c.creatorReferrerId &&
    c.creatorReferralExpiresAt &&
    Date.now() < c.creatorReferralExpiresAt;
  if (referralActive) {
    const netEarn = earn * (1 - WITHDRAW_FEE_RATE_EARNINGS);
    creatorReferralCut = round2(netEarn * CREATOR_REFERRAL_RATE);
  }

  try {
    await Promise.all([
      bill > 0
        ? User.updateOne({ _id: c.callerId }, { $inc: { walletBalance: -bill } })
        : Promise.resolve(),
      earn > 0
        ? User.updateOne({ _id: c.calleeId }, { $inc: { earningsBalance: earn } })
        : Promise.resolve(),
      creatorReferralCut > 0
        ? User.updateOne(
            { _id: c.creatorReferrerId, deletedAt: null, banned: false },
            {
              $inc: {
                referralWalletBalance: creatorReferralCut,
                referralEarnings: creatorReferralCut,
              },
            },
          )
        : Promise.resolve(),
    ]);
    c.cachedCallerBalance = round2((c.cachedCallerBalance || 0) - bill);
    c.cachedCalleeBalance = round2((c.cachedCalleeBalance || 0) + earn);
    if (creatorReferralCut > 0) {
      c.creatorReferralAccrued = round2(
        (c.creatorReferralAccrued || 0) + creatorReferralCut,
      );
    }
    c.lastFlushAt = Date.now();
  } catch (err) {
    // On flush failure, restore the counters so the next flush picks
    // them back up. We may double-emit `wallet:update` in the meantime
    // but the UI is idempotent on those.
    c.unsavedBill = round2(c.unsavedBill + bill);
    c.unsavedEarn = round2(c.unsavedEarn + earn);
    logger.error({ err, callId }, 'billing flush failed');
  }
}

/**
 * Per-second billing tick. Pure in-memory math — no DB hit unless
 * the flush interval has elapsed or the caller has run out of credits.
 *
 * Emits `wallet:update` (and the friendlier `call:billed`/`call:earned`
 * events) every tick so the live wallet pill ticks down once a second.
 */
async function billTick(io, callId) {
  const c = calls.get(callId);
  if (!c || !c.billRate) return;

  const billPerSec = c.billRate / 60;
  const earnPerSec = c.earnRate / 60;

  // In-memory tally of credits owed but not yet flushed.
  c.unsavedBill = round2((c.unsavedBill || 0) + billPerSec);
  c.unsavedEarn = round2((c.unsavedEarn || 0) + earnPerSec);
  c.totalBilled = round2((c.totalBilled || 0) + billPerSec);
  c.totalEarned = round2((c.totalEarned || 0) + earnPerSec);

  const liveCallerBalance = round2(
    Math.max(0, (c.cachedCallerBalance || 0) - (c.unsavedBill || 0)),
  );
  const liveCalleeBalance = round2(
    (c.cachedCalleeBalance || 0) + (c.unsavedEarn || 0),
  );

  // Caller is broke: flush whatever we accrued, then end the call.
  if ((c.cachedCallerBalance || 0) - (c.unsavedBill || 0) <= 0) {
    await flushBilling(callId);
    io.to(room(callId)).emit('call:ended', { callId, reason: 'insufficient_credits' });
    io.to(userRoom(c.callerId)).emit('call:ended', { callId, reason: 'insufficient_credits' });
    io.to(userRoom(c.calleeId)).emit('call:ended', { callId, reason: 'insufficient_credits' });
    await endCall(io, callId, 'insufficient_credits');
    return;
  }

  // Live UI emits — every second, no DB hit.
  notifyUser(c.callerId, 'wallet:update', { walletBalance: liveCallerBalance });
  notifyUser(c.calleeId, 'wallet:update', { earningsBalance: liveCalleeBalance });
  notifyUser(c.callerId, 'call:billed', {
    callId,
    totalBilled: c.totalBilled,
    walletBalance: liveCallerBalance,
  });
  notifyUser(c.calleeId, 'call:earned', {
    callId,
    totalEarned: c.totalEarned,
    earningsBalance: liveCalleeBalance,
    callerBalance: liveCallerBalance,
  });

  // Periodic DB flush (~every 30s).
  if (Date.now() - (c.lastFlushAt || 0) >= FLUSH_INTERVAL_MS) {
    await flushBilling(callId);
  }
}

/**
 * Boot up the per-second ticker and seed the in-memory balance cache
 * from the DB. Called once at call accept.
 */
async function startBillingTicker(io, callId) {
  const c = calls.get(callId);
  if (!c || !c.billRate || c.billTimer) return;

  // Seed cached balances so the live UI starts from the right number.
  // Pull the creator's `referredBy` + `createdAt` in the same query so
  // we can decide once-per-call whether the 30-day creator-referral
  // bonus is still active. After this point every flush just checks
  // `c.creatorReferralExpiresAt` against `Date.now()` — no extra reads.
  const [callerDoc, calleeDoc] = await Promise.all([
    User.findById(c.callerId).select('walletBalance').lean(),
    User.findById(c.calleeId)
      .select('earningsBalance referredBy createdAt')
      .lean(),
  ]);
  c.cachedCallerBalance = round2(callerDoc?.walletBalance || 0);
  c.cachedCalleeBalance = round2(calleeDoc?.earningsBalance || 0);
  c.unsavedBill = 0;
  c.unsavedEarn = 0;
  c.lastFlushAt = Date.now();

  // Creator-referral eligibility. We only care about live calls where
  // the callee was referred and is still inside the bonus window. If
  // the window has already lapsed at call-start we set nothing — the
  // flush short-circuit handles the rest.
  c.creatorReferrerId = null;
  c.creatorReferralExpiresAt = 0;
  c.creatorReferralAccrued = 0;
  if (calleeDoc?.referredBy && calleeDoc?.createdAt) {
    const expiresAt =
      new Date(calleeDoc.createdAt).getTime() + CREATOR_REFERRAL_DURATION_MS;
    if (expiresAt > Date.now()) {
      c.creatorReferrerId = calleeDoc.referredBy;
      c.creatorReferralExpiresAt = expiresAt;
    }
  }

  c.billTimer = setInterval(() => {
    billTick(io, callId).catch((err) =>
      logger.error({ err, callId }, 'billing tick failed'),
    );
  }, 1000);
}

async function endCall(io, callId, reason = 'hangup') {
  const c = calls.get(callId);
  if (!c || c.ending) return;
  // Re-entry guard: both peers' `call:hangup` events plus the server's
  // own `call:ended` emit can all fire endCall(callId) concurrently.
  // Without a synchronous flag set BEFORE the first await, every
  // invocation clears the !c check (since `calls.delete(callId)` only
  // happens at the bottom, after several awaits) and we end up
  // recording the same CallSession twice. Setting `ending` before any
  // await makes subsequent calls bail immediately.
  c.ending = true;
  // Stop the per-second ticker first so no more ticks fire after the
  // final flush below.
  if (c.billTimer) {
    clearInterval(c.billTimer);
    c.billTimer = null;
  }
  // Legacy schedulers from previous deploy versions — clear if present.
  if (c.billTimeout) {
    clearTimeout(c.billTimeout);
    c.billTimeout = null;
  }
  if (c.billInterval) {
    clearInterval(c.billInterval);
    c.billInterval = null;
  }
  // Flush any unsaved billing one last time before we forget the
  // in-memory state. This is the durable record of the call's money.
  await flushBilling(callId);

  // One ReferralPayout row per call (not per flush) so the referrer's
  // history doesn't get spammed with 30-second slices. The cash itself
  // already landed via $inc inside flushBilling — this row is purely
  // for the audit trail / Profile history view. `walletRequestId`
  // stays null (no top-up triggered this) and kind='creator-earn'
  // distinguishes it from topup/signup rows.
  if ((c.creatorReferralAccrued || 0) > 0 && c.creatorReferrerId) {
    try {
      await ReferralPayout.create({
        userId: c.creatorReferrerId,
        referredUserId: c.calleeId,
        walletRequestId: null,
        amount: c.creatorReferralAccrued,
        kind: 'creator-earn',
      });
      logger.info(
        {
          callId,
          referrerId: String(c.creatorReferrerId),
          creatorId: String(c.calleeId),
          amount: c.creatorReferralAccrued,
        },
        'creator referral payout',
      );
    } catch (err) {
      logger.error({ err, callId }, 'failed to record creator referral payout');
    }
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
      totalEarned: c.totalEarned || 0,
      startedAt: c.startedAt,
      endedAt,
      durationSec,
      endReason: reason,
    });
  } catch (err) {
    logger.error({ err, callId }, 'failed to record call session');
  }

  // Clear the in-call (busy) flags for both participants and rebroadcast
  // their post-call status (online if their socket is still connected,
  // offline otherwise — getStatus() figures that out).
  await Promise.all([
    clearBusy(c.callerId).catch(() => {}),
    clearBusy(c.calleeId).catch(() => {}),
  ]);
  if (io) {
    broadcastStatus(io, c.callerId).catch(() => {});
    broadcastStatus(io, c.calleeId).catch(() => {});
  }

  calls.delete(callId);
}

export function registerCallHandlers(io, socket) {
  socket.on('call:invite', async ({ toUserId, packageId, callType }, ack) => {
    try {
      if (!toUserId) return ack?.({ error: 'Missing toUserId' });
      const allowed = await canMessage(socket.user.id, toUserId);
      if (!allowed) return ack?.({ error: 'Not subscribed' });
      // Default to 'video' for backwards compat. Audio-only calls skip
      // the video stream on both sides but reuse the same signaling path.
      const kind = callType === 'audio' ? 'audio' : 'video';

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

        // Caller only needs enough credits for the FIRST minute. The
        // call-time billing ticker keeps debiting per second; once the
        // wallet hits zero the call ends with reason
        // 'insufficient_credits'. This lets viewers with smaller
        // balances still connect and chat for as long as they can
        // afford, instead of being blocked from a 30-minute package
        // because their wallet is at the cost of 5 minutes.
        const caller = await User.findById(socket.user.id).select('walletBalance').lean();
        const balance = caller?.walletBalance || 0;
        if (balance < billRate) {
          return ack?.({
            error: 'Not enough credits for one minute',
            code: 'INSUFFICIENT_CREDITS',
            required: billRate,
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
        callType: kind,
      });
      socket.join(room(callId));

      io.to(userRoom(toUserId)).emit('call:incoming', {
        callId,
        from: { id: socket.user.id, username: socket.user.username },
        packageId: pkgId ? String(pkgId) : null,
        perMinuteRate: billRate,
        earnRate,
        callerBalance,
        callType: kind,
      });
      ack?.({ ok: true, callId, perMinuteRate: billRate, callType: kind });
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

    // Mark both peers busy so their presence dot turns red on every
    // other client's UI. Fire-and-forget — Redis hiccups shouldn't
    // block the call from proceeding.
    setBusy(c.callerId, callId).catch(() => {});
    setBusy(c.calleeId, callId).catch(() => {});
    broadcastStatus(io, c.callerId).catch(() => {});
    broadcastStatus(io, c.calleeId).catch(() => {});

    if (c.billRate > 0 && !c.billTimer) {
      // 1Hz ticker — UI updates every second, DB flushes every 30s
      // (and on call end). See startBillingTicker.
      startBillingTicker(io, callId).catch((err) =>
        logger.error({ err, callId }, 'failed to start billing ticker'),
      );
    }

    ack?.({ ok: true });
  });

  socket.on('call:reject', async ({ callId }) => {
    const c = calls.get(callId);
    if (!c) return;
    if (String(c.calleeId) !== String(socket.user.id)) return;
    io.to(userRoom(c.callerId)).emit('call:rejected', { callId });
    io.to(userRoom(c.calleeId)).emit('call:rejected', { callId });
    await endCall(io, callId, 'rejected');
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
    await endCall(io, callId, 'hangup');
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
