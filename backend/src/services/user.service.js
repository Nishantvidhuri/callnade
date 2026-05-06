import { User } from '../models/user.model.js';
import { Media } from '../models/media.model.js';
import { Follow } from '../models/follow.model.js';
import { FollowRequest } from '../models/followRequest.model.js';
import { Package } from '../models/package.model.js';
import { redis } from '../config/redis.js';
import { notFound } from '../utils/HttpError.js';
import { avatarThumb } from '../utils/signedUrl.js';
import { subscriberPrice } from '../utils/pricing.js';
import { presentMedia } from './media.service.js';

const PROFILE_CACHE_TTL = 60;
const profileKey = (username) => `profile:${username}`;

// Admins are completely hidden from public discovery — they don't show up
// in popular, online, search, mutuals, or any other listing. Their profile
// page also 404s for everyone except themselves. Apply this filter to every
// User.find() that's user-facing.
//
// We also exclude soft-deleted accounts (deletedAt set) and banned ones for
// the same reason — they shouldn't appear anywhere user-facing.
const NON_ADMIN_FILTER = {
  role: { $ne: 'admin' },
  isAdmin: { $ne: true },
  deletedAt: null,
  banned: { $ne: true },
};

export async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');
  const gallery = await Media.find({ userId, type: 'gallery' }).sort({ position: 1 }).lean();
  return {
    user: user.toJSON(),
    avatar: await loadAvatar(user.avatarMediaId),
    gallery: gallery.map((m) => presentMedia(m, { canViewLocked: true })),
  };
}

export async function upgradeToProvider(userId) {
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');
  if (user.role === 'admin') return { user: user.toJSON() };
  if (user.role !== 'provider') {
    user.role = 'provider';
    await user.save();
  }
  return { user: user.toJSON() };
}

export async function updateMe(userId, patch) {
  const allowed = (({ displayName, bio, isPrivate }) => ({ displayName, bio, isPrivate }))(patch);
  Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  const user = await User.findByIdAndUpdate(userId, allowed, { new: true });
  await redis.del(profileKey(user.username));
  return user.toJSON();
}

export async function getPublicProfile(username, viewerId) {
  const cached = await redis.get(profileKey(username));
  let user;
  if (cached) {
    user = JSON.parse(cached);
  } else {
    const found = await User.findOne({ username }).lean();
    if (!found) throw notFound('User not found');
    user = {
      _id: found._id,
      username: found.username,
      displayName: found.displayName,
      bio: found.bio,
      avatarMediaId: found.avatarMediaId,
      isPrivate: found.isPrivate,
      followerCount: found.followerCount,
      followingCount: found.followingCount,
      role: found.role || (found.isAdmin ? 'admin' : 'user'),
      createdAt: found.createdAt,
    };
    await redis.set(profileKey(username), JSON.stringify(user), 'EX', PROFILE_CACHE_TTL);
  }

  const isOwner = viewerId && String(viewerId) === String(user._id);
  // Admin profiles are private — only the admin themselves can view their
  // own profile page. Anyone else (including direct /u/admin URL) sees 404.
  if (user.role === 'admin' && !isOwner) throw notFound('User not found');
  // Soft-deleted accounts are 404 for everyone (the data is retained for
  // audit but the user is gone as far as the public is concerned).
  if (user.deletedAt) throw notFound('User not found');
  let isFollower = false;
  let isFollowedBy = false;
  let hasPendingRequest = false;
  if (!isOwner && viewerId) {
    const [a, b, c] = await Promise.all([
      Follow.exists({ follower: viewerId, followee: user._id }),
      Follow.exists({ follower: user._id, followee: viewerId }),
      FollowRequest.exists({ from: viewerId, to: user._id }),
    ]);
    isFollower = !!a;
    isFollowedBy = !!b;
    hasPendingRequest = !!c;
  }
  const isMutual = isFollower && isFollowedBy;
  // Subscriptions are no longer required to chat or call — anyone can reach anyone.
  const canMessage = !isOwner;
  const canViewLocked = isOwner || isFollower;

  const [avatar, galleryDocs, packages] = await Promise.all([
    loadAvatar(user.avatarMediaId),
    Media.find({ userId: user._id, type: 'gallery' }).sort({ position: 1 }).lean(),
    user.role === 'provider'
      ? Package.find({ providerId: user._id, active: true }).sort({ createdAt: -1 }).lean()
      : Promise.resolve([]),
  ]);

  return {
    user,
    avatar,
    gallery: galleryDocs.map((m) => presentMedia(m, { canViewLocked })),
    packages: packages.map((p) => ({
      id: String(p._id),
      title: p.title,
      description: p.description || '',
      // Subscribers see the platform-adjusted price; the creator viewing their own
      // profile sees the raw price they set.
      price: isOwner ? p.price : subscriberPrice(p.price),
      durationMinutes: p.durationMinutes ?? null,
    })),
    relationship: {
      isOwner,
      isFollower,
      isFollowedBy,
      isMutual,
      hasPendingRequest,
      canViewLocked,
      canMessage,
    },
  };
}

export async function discover({ cursor, limit = 24, excludeUserId }) {
  const q = { ...NON_ADMIN_FILTER };
  if (excludeUserId) q._id = { $ne: excludeUserId };
  if (cursor) q._id = { ...(q._id || {}), $lt: cursor };
  const users = await User.find(q)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .select('_id username displayName followerCount avatarMediaId')
    .lean();
  const hasMore = users.length > limit;
  const trimmed = hasMore ? users.slice(0, limit) : users;
  const cards = await formatUserCards(trimmed);
  return {
    items: cards,
    nextCursor: hasMore ? trimmed[trimmed.length - 1]._id : null,
  };
}

export async function search(query, { limit = 24 } = {}) {
  const q = (query || '').trim();
  if (!q) return { items: [] };
  const re = new RegExp(escapeRegex(q), 'i');
  const users = await User.find({
    ...NON_ADMIN_FILTER,
    $or: [{ username: re }, { displayName: re }],
  })
    .limit(limit)
    .select('_id username displayName followerCount avatarMediaId')
    .lean();
  return { items: await formatUserCards(users) };
}

export async function listMyFollowing(userId, { cursor, limit = 24 }) {
  const q = { follower: userId };
  if (cursor) q._id = { $lt: cursor };
  const follows = await Follow.find(q)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('followee', '_id username displayName followerCount avatarMediaId role isAdmin')
    .lean();
  const hasMore = follows.length > limit;
  const trimmed = hasMore ? follows.slice(0, limit) : follows;
  // Defensive: hide admins even if a stale Follow row exists.
  const followees = trimmed
    .map((f) => f.followee)
    .filter((u) => u && u.role !== 'admin' && !u.isAdmin);
  const cards = await formatUserCards(followees);
  return {
    items: cards,
    nextCursor: hasMore ? trimmed[trimmed.length - 1]._id : null,
  };
}

export async function listMutuals(userId, { limit = 50 } = {}) {
  // "Conversations" = anyone you've subscribed to OR who has subscribed to you.
  const [out, inn] = await Promise.all([
    Follow.find({ follower: userId }).select('followee').lean(),
    Follow.find({ followee: userId }).select('follower').lean(),
  ]);
  const peerIds = new Set();
  out.forEach((f) => peerIds.add(String(f.followee)));
  inn.forEach((f) => peerIds.add(String(f.follower)));
  if (!peerIds.size) return { items: [] };
  const users = await User.find({
    _id: { $in: Array.from(peerIds) },
    ...NON_ADMIN_FILTER,
  })
    .limit(limit)
    .select('_id username displayName avatarMediaId')
    .lean();
  const cards = await formatUserCards(users);
  const onlineIds = await getOnlineSet(cards.map((c) => c.id));
  return { items: cards.map((c) => ({ ...c, online: onlineIds.has(String(c.id)) })) };
}

async function getAllOnlineIds() {
  const ids = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'presence:*', 'COUNT', 200);
    cursor = next;
    for (const key of batch) ids.push(key.replace(/^presence:/, ''));
  } while (cursor !== '0');
  return ids;
}

export async function listOnline({ limit = 24, excludeUserId } = {}) {
  const ids = (await getAllOnlineIds()).filter((id) => id !== String(excludeUserId));
  if (!ids.length) return { items: [] };
  // Only providers (creators) appear in "Online now" — regular users and
  // admins are hidden even when their socket is connected. Deleted accounts
  // are also hidden.
  const users = await User.find({
    _id: { $in: ids },
    role: 'provider',
    banned: { $ne: true },
    deletedAt: null,
  })
    .limit(limit)
    .select('_id username displayName followerCount avatarMediaId')
    .lean();
  const cards = await formatUserCards(users);
  return { items: cards.map((c) => ({ ...c, online: true })) };
}

async function getOnlineSet(ids) {
  if (!ids.length) return new Set();
  const keys = ids.map((id) => `presence:${id}`);
  const values = await redis.mget(...keys);
  const set = new Set();
  values.forEach((v, i) => {
    if (v) set.add(String(ids[i]));
  });
  return set;
}

async function formatUserCards(users) {
  if (!users.length) return [];
  const avatarIds = users.map((u) => u.avatarMediaId).filter(Boolean);
  const avatars = avatarIds.length
    ? await Media.find({ _id: { $in: avatarIds } }).select('_id variants').lean()
    : [];
  const avatarMap = new Map(avatars.map((a) => [String(a._id), a]));
  return users.map((u) => ({
    id: u._id,
    username: u.username,
    displayName: u.displayName,
    followerCount: u.followerCount || 0,
    avatarUrl: u.avatarMediaId
      ? avatarThumb(avatarMap.get(String(u.avatarMediaId)))
      : null,
  }));
}

async function loadAvatar(mediaId) {
  if (!mediaId) return null;
  const m = await Media.findById(mediaId).lean();
  return m ? presentMedia(m, { canViewLocked: true }) : null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
