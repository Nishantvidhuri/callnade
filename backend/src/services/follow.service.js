import { User } from '../models/user.model.js';
import { Follow } from '../models/follow.model.js';
import { FollowRequest } from '../models/followRequest.model.js';
import { Media } from '../models/media.model.js';
import { notificationQueue } from '../queues/queues.js';
import { redis } from '../config/redis.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/HttpError.js';
import { notifyUser } from '../realtime/io.js';
import { avatarThumb } from '../utils/signedUrl.js';

async function loadActor(userId) {
  const u = await User.findById(userId)
    .select('_id username displayName avatarMediaId')
    .lean();
  if (!u) return null;
  let avatarUrl = null;
  if (u.avatarMediaId) {
    const m = await Media.findById(u.avatarMediaId).select('_id variants').lean();
    avatarUrl = avatarThumb(m);
  }
  return {
    id: String(u._id),
    username: u.username,
    displayName: u.displayName,
    avatarUrl,
  };
}

async function invalidateProfile(userId) {
  const u = await User.findById(userId).select('username').lean();
  if (u) await redis.del(`profile:${u.username}`);
}

export async function requestFollow(fromId, toId) {
  if (String(fromId) === String(toId)) throw badRequest('Cannot follow yourself');
  const target = await User.findById(toId).lean();
  if (!target) throw notFound('User not found');

  const existing = await Follow.exists({ follower: fromId, followee: toId });
  if (existing) throw conflict('Already following', 'ALREADY_FOLLOWING');

  if (!target.isPrivate) {
    return acceptInternal(fromId, toId);
  }

  try {
    const req = await FollowRequest.create({ from: fromId, to: toId });
    const actor = await loadActor(fromId);
    notifyUser(toId, 'notification:new', {
      id: `req-${req._id}`,
      type: 'follow_request',
      from: actor,
      requestId: String(req._id),
      createdAt: req.createdAt || new Date().toISOString(),
    });
    notificationQueue.add('notify', {
      kind: 'follow_request',
      toUserId: toId,
      payload: { from: fromId },
    }).catch(() => {});
    return { status: 'pending', requestId: req._id };
  } catch (err) {
    if (err.code === 11000) throw conflict('Request already sent', 'REQUEST_PENDING');
    throw err;
  }
}

export async function respondToRequest(userId, requestId, action) {
  const req = await FollowRequest.findById(requestId);
  if (!req) throw notFound('Request not found');
  if (String(req.to) !== String(userId)) throw forbidden();

  if (action === 'reject') {
    await req.deleteOne();
    notifyUser(req.to, 'notification:remove', { id: `req-${req._id}` });
    return { status: 'rejected' };
  }

  await acceptInternal(req.from, req.to);
  await req.deleteOne();
  const actor = await loadActor(req.to);
  notifyUser(req.from, 'notification:new', {
    id: `acc-${req._id}`,
    type: 'follow_accepted',
    from: actor,
    createdAt: new Date().toISOString(),
  });
  // Tell the recipient to clear the local pending-request notification
  notifyUser(req.to, 'notification:remove', { id: `req-${req._id}` });
  notificationQueue.add('notify', {
    kind: 'follow_accepted',
    toUserId: req.from,
    payload: { by: req.to },
  }).catch(() => {});
  return { status: 'accepted' };
}

async function acceptInternal(followerId, followeeId) {
  try {
    await Follow.create({ follower: followerId, followee: followeeId });
  } catch (err) {
    if (err.code === 11000) throw conflict('Already following', 'ALREADY_FOLLOWING');
    throw err;
  }
  await Promise.all([
    User.updateOne({ _id: followeeId }, { $inc: { followerCount: 1 } }),
    User.updateOne({ _id: followerId }, { $inc: { followingCount: 1 } }),
    invalidateProfile(followerId),
    invalidateProfile(followeeId),
  ]);
  notifyUser(followerId, 'subscription:changed', { peerId: String(followeeId) });
  notifyUser(followeeId, 'subscription:changed', { peerId: String(followerId) });
  return { status: 'accepted' };
}

export async function unfollow(followerId, followeeId) {
  const r = await Follow.deleteOne({ follower: followerId, followee: followeeId });
  if (r.deletedCount === 0) return { ok: false };
  await Promise.all([
    User.updateOne({ _id: followeeId }, { $inc: { followerCount: -1 } }),
    User.updateOne({ _id: followerId }, { $inc: { followingCount: -1 } }),
    invalidateProfile(followerId),
    invalidateProfile(followeeId),
  ]);
  notifyUser(followerId, 'subscription:changed', { peerId: String(followeeId) });
  notifyUser(followeeId, 'subscription:changed', { peerId: String(followerId) });
  return { ok: true };
}

export async function listIncoming(userId, { cursor, limit = 20 }) {
  const q = { to: userId };
  if (cursor) q._id = { $lt: cursor };
  const items = await FollowRequest.find(q)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('from', 'username displayName avatarMediaId')
    .lean();
  return paginate(items, limit);
}

export async function listOutgoing(userId, { cursor, limit = 20 }) {
  const q = { from: userId };
  if (cursor) q._id = { $lt: cursor };
  const items = await FollowRequest.find(q)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('to', 'username displayName avatarMediaId')
    .lean();
  return paginate(items, limit);
}

export async function listFollowers(userId, { cursor, limit = 20 }) {
  const q = { followee: userId };
  if (cursor) q._id = { $lt: cursor };
  const items = await Follow.find(q)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('follower', 'username displayName avatarMediaId')
    .lean();
  return paginate(items, limit);
}

export async function listFollowing(userId, { cursor, limit = 20 }) {
  const q = { follower: userId };
  if (cursor) q._id = { $lt: cursor };
  const items = await Follow.find(q)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('followee', 'username displayName avatarMediaId')
    .lean();
  return paginate(items, limit);
}

export async function isMutual(a, b) {
  const [ab, ba] = await Promise.all([
    Follow.exists({ follower: a, followee: b }),
    Follow.exists({ follower: b, followee: a }),
  ]);
  return !!ab && !!ba;
}

// Anyone can message/call anyone — subscriptions are no longer a gate.
// (We still keep the function so chat/call handlers compile; same-user check
// remains as a sanity guard.)
export async function canMessage(a, b) {
  if (String(a) === String(b)) return false;
  return true;
}

function paginate(items, limit) {
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;
  return { items: trimmed, nextCursor: hasMore ? trimmed[trimmed.length - 1]._id : null };
}
