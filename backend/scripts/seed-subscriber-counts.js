// Sets a random follower count between 2000 and 3000 on every provider so
// the Popular grid looks populated. Also bumps popularityScore to match so
// the sort order reflects the new numbers, and busts the cache so changes
// show immediately.
//
//   node scripts/seed-subscriber-counts.js

import 'dotenv/config';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';

const MIN = 2000;
const MAX = 3000;

const randomInRange = () => MIN + Math.floor(Math.random() * (MAX - MIN + 1));

async function main() {
  await mongoose.connect(env.MONGO_URI);

  const providers = await User.find({ role: 'provider' })
    .select('_id username displayName')
    .lean();

  if (!providers.length) {
    console.log('No providers found.');
    await mongoose.disconnect();
    return;
  }

  for (const p of providers) {
    const count = randomInRange();
    await User.updateOne(
      { _id: p._id },
      { $set: { followerCount: count, popularityScore: count } },
    );
    console.log(`  ${p.displayName.padEnd(18)}  @${p.username.padEnd(20)}  →  ${count}`);
  }

  // Bust the popular cache so the new numbers + ordering surface immediately.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    const profileKeys = await redis.keys('profile:*');
    const keysToDelete = ['popular:top', 'popular:providers:v2', ...profileKeys];
    if (keysToDelete.length) await redis.del(...keysToDelete);
    console.log(`\nCleared ${keysToDelete.length} cache keys.`);
  } finally {
    await redis.quit().catch(() => {});
  }

  console.log(`\nDone. Set random subscriber counts (${MIN}-${MAX}) on ${providers.length} providers.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
