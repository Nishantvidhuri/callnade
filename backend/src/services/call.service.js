import { CallSession } from '../models/callSession.model.js';
import { User } from '../models/user.model.js';
import { Media } from '../models/media.model.js';
import { makeTurnCredentials } from '../utils/turnCreds.js';
import { avatarThumb } from '../utils/signedUrl.js';

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
