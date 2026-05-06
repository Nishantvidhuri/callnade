import { User } from '../models/user.model.js';
import { Media } from '../models/media.model.js';
import { redis } from '../config/redis.js';
import { avatarThumb } from '../utils/signedUrl.js';

// v2: providers-only — bust the old cache key on deploy
const CACHE_KEY = 'popular:providers:v2';
const CACHE_TTL = 600;
const PAGE_SIZE = 20;
const MAX_CACHED = 1000;

export async function getPopular({ cursor, limit = PAGE_SIZE, viewerId } = {}) {
  const all = await loadTop();
  // Hide the viewer from their own popular list (you don't show up to yourself).
  // Admin accounts are already excluded by the role:'provider' filter in
  // loadTop(), but we keep this defensive in case role gets changed later.
  const visible = all.filter(
    (u) => (!viewerId || String(u._id) !== String(viewerId)) && u.role !== 'admin' && !u.isAdmin,
  );
  const start = cursor ? visible.findIndex((u) => String(u._id) === cursor) + 1 : 0;
  const slice = visible.slice(start, start + limit);
  const nextCursor = start + limit < visible.length ? String(slice[slice.length - 1]?._id) : null;

  const avatarIds = slice.map((u) => u.avatarMediaId).filter(Boolean);
  const avatars = avatarIds.length
    ? await Media.find({ _id: { $in: avatarIds } })
        .select('_id variants')
        .lean()
    : [];
  const avatarMap = new Map(avatars.map((a) => [String(a._id), a]));

  return {
    items: slice.map((u) => ({
      id: u._id,
      username: u.username,
      displayName: u.displayName,
      followerCount: u.followerCount,
      avatarUrl: u.avatarMediaId
        ? avatarThumb(avatarMap.get(String(u.avatarMediaId)))
        : null,
    })),
    nextCursor,
  };
}

async function loadTop() {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);
  // Only providers (creators) appear in the popular list — admins and
  // regular users are excluded. Banned accounts are also hidden.
  const top = await User.find({ role: 'provider', banned: { $ne: true }, deletedAt: null })
    .sort({ popularityScore: -1, _id: -1 })
    .limit(MAX_CACHED)
    .select('_id username displayName followerCount avatarMediaId role isAdmin')
    .lean();
  await redis.set(CACHE_KEY, JSON.stringify(top), 'EX', CACHE_TTL);
  return top;
}
