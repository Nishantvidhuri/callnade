import { User } from '../../models/user.model.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';

const CACHE_KEY = 'popular:top';
const TOP_N = 200;

export async function recomputePopularity() {
  const cursor = User.find({}, { followerCount: 1, lastSeenAt: 1 }).cursor();
  const ops = [];
  for await (const u of cursor) {
    const days = u.lastSeenAt ? (Date.now() - u.lastSeenAt.getTime()) / 86_400_000 : 30;
    const decay = Math.min(days, 30) * 0.1;
    const score = u.followerCount - decay;
    ops.push({ updateOne: { filter: { _id: u._id }, update: { popularityScore: score } } });
    if (ops.length >= 1000) {
      await User.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }
  if (ops.length) await User.bulkWrite(ops, { ordered: false });

  const top = await User.find()
    .sort({ popularityScore: -1 })
    .limit(TOP_N)
    .select('_id username displayName followerCount avatarMediaId')
    .lean();

  await redis.set(CACHE_KEY, JSON.stringify(top), 'EX', 600);
  logger.info({ count: top.length }, 'popularity recomputed');
  return { count: top.length };
}
