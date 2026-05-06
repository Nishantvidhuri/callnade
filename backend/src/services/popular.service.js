import { User } from '../models/user.model.js';
import { Media } from '../models/media.model.js';
import { redis } from '../config/redis.js';
import { avatarThumb } from '../utils/signedUrl.js';

// v3: providers, segmented by isAdult — bust caches on deploy.
const CACHE_KEY_NORMAL = 'popular:providers:v3:normal';
const CACHE_KEY_ADULT = 'popular:providers:v3:adult';
const CACHE_TTL = 600;
const PAGE_SIZE = 20;
const MAX_CACHED = 1000;

export async function getPopular({ cursor, limit = PAGE_SIZE, viewerId, adult = false } = {}) {
  const all = await loadTop(!!adult);
  // Hide the viewer from their own popular list. Admin/banned/deleted are
  // already excluded by the loadTop filter; defensive check stays.
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
      earningsBalance: u.earningsBalance || 0,
      avatarUrl: u.avatarMediaId
        ? avatarThumb(avatarMap.get(String(u.avatarMediaId)))
        : null,
    })),
    nextCursor,
  };
}

async function loadTop(adult) {
  const key = adult ? CACHE_KEY_ADULT : CACHE_KEY_NORMAL;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  // Use { $ne: true } / { $eq: true } so legacy creators created before
  // the isAdult field existed (where the path is missing entirely) still
  // appear in the normal bucket. A plain { isAdult: false } would skip
  // them because Mongo treats "missing" and "false" as different values.
  const top = await User.find({
    role: 'provider',
    banned: { $ne: true },
    deletedAt: null,
    isAdult: adult ? true : { $ne: true },
  })
    .sort({ popularityScore: -1, _id: -1 })
    .limit(MAX_CACHED)
    .select('_id username displayName followerCount avatarMediaId role isAdmin isAdult earningsBalance')
    .lean();
  await redis.set(key, JSON.stringify(top), 'EX', CACHE_TTL);
  return top;
}
