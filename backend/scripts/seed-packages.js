// Seeds 4 packages on every provider account:
//   1. 15-min audio call   (150–250 credits)
//   2. 30-min audio call   (260–380 credits)
//   3. 15-min video call   (170–250 credits)
//   4. 30-min video call   (290–450 credits)
//
// Wipes any pre-existing packages for each provider first so the menu is
// always exactly these four after running. Idempotent — re-run anytime
// to reroll the random prices.
//
//   node scripts/seed-packages.js

import 'dotenv/config';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';
import { Package } from '../src/models/package.model.js';

// Price bands per (callType, durationMinutes). 15-min stays in 150–250;
// audio is priced slightly lower than video to reflect lower production.
const PRICE_RANGES = {
  audio: { 15: [150, 230], 30: [260, 380] },
  video: { 15: [170, 250], 30: [290, 450] },
};

const randIn = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function buildPackages() {
  const out = [];
  for (const callType of ['audio', 'video']) {
    for (const mins of [15, 30]) {
      const [lo, hi] = PRICE_RANGES[callType][mins];
      out.push({
        title: `${mins}-min ${callType} call`,
        description: `Live ${mins}-minute ${callType} call`,
        price: randIn(lo, hi),
        durationMinutes: mins,
        callType,
        active: true,
      });
    }
  }
  return out;
}

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

  let totalInserted = 0;
  for (const p of providers) {
    await Package.deleteMany({ providerId: p._id });
    const packages = buildPackages();
    await Package.insertMany(packages.map((pkg) => ({ ...pkg, providerId: p._id })));
    totalInserted += packages.length;
    const summary = packages
      .map((pkg) => `${pkg.callType[0]}${pkg.durationMinutes}=${pkg.price}`)
      .join(' ');
    console.log(`  @${p.username.padEnd(12)} ${p.displayName.padEnd(18)}  →  ${summary}`);
  }

  // Bust cached profile pages so the new packages render immediately.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    const profileKeys = await redis.keys('profile:*');
    if (profileKeys.length) await redis.del(...profileKeys);
    console.log(`\nCleared ${profileKeys.length} profile cache keys.`);
  } finally {
    await redis.quit().catch(() => {});
  }

  console.log(
    `\nDone. Reset packages for ${providers.length} provider${providers.length === 1 ? '' : 's'} ` +
    `(${totalInserted} packages total — 4 per creator).`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
