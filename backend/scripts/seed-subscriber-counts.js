// Sets a random follower count (2000–3000) AND random earningsBalance
// (10000–20000) on every provider so the Popular grid looks populated and
// each card shows a realistic earnings chip. Also bumps popularityScore
// to match so the sort order reflects the new numbers, and busts the
// cache so changes show immediately.
//
//   node scripts/seed-subscriber-counts.js

import 'dotenv/config';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';

const SUB_MIN = 2000;
const SUB_MAX = 3000;
const EARN_MIN = 10000;
const EARN_MAX = 20000;

const randIn = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

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
    const subs = randIn(SUB_MIN, SUB_MAX);
    const earnings = randIn(EARN_MIN, EARN_MAX);
    await User.updateOne(
      { _id: p._id },
      {
        $set: {
          followerCount: subs,
          popularityScore: subs,
          earningsBalance: earnings,
        },
      },
    );
    console.log(
      `  ${p.displayName.padEnd(18)}  @${p.username.padEnd(20)}  subs=${subs}  earnings=${earnings}`,
    );
  }

  // Bust the popular cache so the new numbers + ordering surface immediately.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    const profileKeys = await redis.keys('profile:*');
    const keysToDelete = [
      'popular:top',
      'popular:providers:v2',
      'popular:providers:v3:normal',
      'popular:providers:v3:adult',
      ...profileKeys,
    ];
    if (keysToDelete.length) await redis.del(...keysToDelete);
    console.log(`\nCleared ${keysToDelete.length} cache keys.`);
  } finally {
    await redis.quit().catch(() => {});
  }

  console.log(
    `\nDone. Subs ${SUB_MIN}-${SUB_MAX}, earnings ${EARN_MIN}-${EARN_MAX} on ${providers.length} providers.`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
