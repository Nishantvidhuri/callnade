import mongoose from 'mongoose';
import { CallSession } from '../models/callSession.model.js';
import { User } from '../models/user.model.js';
import { Media } from '../models/media.model.js';
import { makeTurnCredentials } from '../utils/turnCreds.js';
import { avatarThumb } from '../utils/signedUrl.js';
import { PLATFORM_MARGIN } from '../utils/pricing.js';

export function iceConfigFor(userId) {
  return makeTurnCredentials(userId);
}

export async function callHistory(userId, { limit = 50 } = {}) {
  const sessions = await CallSession.find({
    $or: [{ callerId: userId }, { calleeId: userId }],
  })
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();

  if (!sessions.length) return { items: [] };

  const peerIds = new Set();
  for (const s of sessions) {
    peerIds.add(
      String(s.callerId) === String(userId) ? String(s.calleeId) : String(s.callerId),
    );
  }

  const users = await User.find({ _id: { $in: Array.from(peerIds) } })
    .select('_id username displayName avatarMediaId')
    .lean();

  const avatarIds = users.map((u) => u.avatarMediaId).filter(Boolean);
  const avatars = avatarIds.length
    ? await Media.find({ _id: { $in: avatarIds } }).select('_id variants').lean()
    : [];
  const avatarMap = new Map(avatars.map((a) => [String(a._id), a]));

  const userMap = new Map(
    users.map((u) => [
      String(u._id),
      {
        id: String(u._id),
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarMediaId
          ? avatarThumb(avatarMap.get(String(u.avatarMediaId)))
          : null,
      },
    ]),
  );

  return {
    items: sessions.map((s) => {
      const isCaller = String(s.callerId) === String(userId);
      const peerId = isCaller ? String(s.calleeId) : String(s.callerId);
      return {
        id: String(s._id),
        peer: userMap.get(peerId) || null,
        direction: isCaller ? 'outgoing' : 'incoming',
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSec: s.durationSec || 0,
        endReason: s.endReason,
      };
    }),
  };
}

export async function recordSession(data) {
  return CallSession.create(data);
}

/**
 * Transaction ledger derived from CallSession.
 *
 * Each call produces (up to) two ledger rows:
 *   - For the caller:  one OUTGOING row for `totalBilled` credits
 *   - For the creator: one INCOMING row for `totalEarned` credits
 *
 * From the perspective of one user we only return the side that applies
 * (their direction) — the other side belongs to the peer's ledger.
 *
 * Sessions where nothing was billed (rejected / missed / instant hangup
 * with totalBilled === 0) are omitted so the list stays signal-only.
 *
 * For older sessions written before `totalEarned` was tracked, we
 * back-fill the earned amount as `totalBilled / (1 + PLATFORM_MARGIN)`.
 * That matches what the live billing path produces, so historical
 * earnings are consistent with what the creator's wallet shows.
 *
 * Cursor pagination uses `_id` (descending) so the latest transactions
 * surface first.
 */
export async function listTransactions(userId, { cursor, limit = 30 } = {}) {
  const lim = Math.min(Math.max(limit, 1), 100);
  const filter = {
    $or: [{ callerId: userId }, { calleeId: userId }],
    // Skip rows that didn't move money in either direction.
    $and: [
      {
        $or: [
          { totalBilled: { $gt: 0 } },
          { totalEarned: { $gt: 0 } },
        ],
      },
    ],
  };
  if (cursor) {
    try {
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    } catch {
      /* malformed cursor — ignore, return from start */
    }
  }

  const sessions = await CallSession.find(filter)
    .sort({ _id: -1 })
    .limit(lim + 1)
    .lean();

  const hasMore = sessions.length > lim;
  const trimmed = hasMore ? sessions.slice(0, lim) : sessions;

  // Hydrate peer info (one DB roundtrip).
  const peerIds = new Set();
  for (const s of trimmed) {
    peerIds.add(
      String(s.callerId) === String(userId) ? String(s.calleeId) : String(s.callerId),
    );
  }
  const users = peerIds.size
    ? await User.find({ _id: { $in: Array.from(peerIds) } })
        .select('_id username displayName avatarMediaId')
        .lean()
    : [];
  const avatarIds = users.map((u) => u.avatarMediaId).filter(Boolean);
  const avatars = avatarIds.length
    ? await Media.find({ _id: { $in: avatarIds } }).select('_id variants').lean()
    : [];
  const avatarMap = new Map(avatars.map((a) => [String(a._id), a]));
  const userMap = new Map(
    users.map((u) => [
      String(u._id),
      {
        id: String(u._id),
        username: u.username,
        displayName: u.displayName || u.username,
        avatarUrl: u.avatarMediaId
          ? avatarThumb(avatarMap.get(String(u.avatarMediaId)))
          : null,
      },
    ]),
  );

  const round2 = (n) => Math.round((n || 0) * 100) / 100;
  const items = trimmed.map((s) => {
    const isCaller = String(s.callerId) === String(userId);
    const peerId = isCaller ? String(s.calleeId) : String(s.callerId);
    const totalBilled = s.totalBilled || 0;
    const totalEarned =
      s.totalEarned ||
      (totalBilled > 0 ? round2(totalBilled / (1 + PLATFORM_MARGIN)) : 0);
    const amount = isCaller ? totalBilled : totalEarned;

    return {
      id: String(s._id),
      direction: isCaller ? 'outgoing' : 'incoming',
      amount: round2(amount),
      durationSec: s.durationSec || 0,
      perMinuteRate: s.perMinuteRate || 0,
      endReason: s.endReason,
      at: s.endedAt || s.startedAt,
      peer: userMap.get(peerId) || null,
    };
  });

  // Aggregate totals over the full ledger (not just this page) — useful
  // for the summary cards on the billing page. Two cheap aggregations.
  const [outAgg, inAgg] = await Promise.all([
    CallSession.aggregate([
      { $match: { callerId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$totalBilled' }, count: { $sum: 1 } } },
    ]),
    CallSession.aggregate([
      { $match: { calleeId: new mongoose.Types.ObjectId(userId) } },
      // Use totalEarned when set; otherwise back-fill from totalBilled.
      {
        $project: {
          earned: {
            $cond: [
              { $gt: ['$totalEarned', 0] },
              '$totalEarned',
              { $divide: ['$totalBilled', 1 + PLATFORM_MARGIN] },
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$earned' }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    items,
    nextCursor: hasMore ? String(trimmed[trimmed.length - 1]._id) : null,
    summary: {
      outgoingTotal: round2(outAgg[0]?.total || 0),
      outgoingCount: outAgg[0]?.count || 0,
      incomingTotal: round2(inAgg[0]?.total || 0),
      incomingCount: inAgg[0]?.count || 0,
    },
  };
}
