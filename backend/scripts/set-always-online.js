#!/usr/bin/env node
/**
 * Sets `alwaysOnline: true` on @pooja, @meera, @ishita so they
 * appear online (and show up in the "Online now" rail) regardless
 * of whether they actually have a browser tab open. Busy state
 * still overrides — they show 'busy' while in a call.
 *
 *   cd backend
 *   node scripts/set-always-online.js          # preview
 *   node scripts/set-always-online.js --apply  # commit
 *
 * Edit USERNAMES to add / remove creators.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';

const USERNAMES = ['pooja', 'meera', 'ishita'];
const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.MONGO_URI);

  const users = await User.find({ username: { $in: USERNAMES } })
    .select('_id username displayName role alwaysOnline')
    .lean();

  const missing = USERNAMES.filter(
    (u) => !users.find((row) => row.username === u),
  );
  if (missing.length) {
    console.error(`Missing accounts: ${missing.map((m) => '@' + m).join(', ')}`);
  }

  console.log('\nTargets:');
  for (const u of users) {
    const arrow = u.alwaysOnline ? '=' : '→';
    console.log(
      `  @${u.username.padEnd(8)}  ` +
        `${(u.displayName || '—').padEnd(20)}  ` +
        `${u.role.padEnd(8)}  ` +
        `alwaysOnline: ${u.alwaysOnline ? 'true' : 'false'} ${arrow} true`,
    );
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  const res = await User.updateMany(
    { username: { $in: USERNAMES } },
    { $set: { alwaysOnline: true } },
  );
  console.log(`\nFlipped ${res.modifiedCount} of ${res.matchedCount} account(s).`);

  // Bust profile caches so the change shows up immediately on
  // /u/<username> for any viewer who had the row cached.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    const keys = users.map((u) => `profile:${u.username}`);
    if (keys.length) {
      const dropped = await redis.del(...keys);
      console.log(`Cleared ${dropped} profile cache key(s).`);
    }
  } finally {
    await redis.quit().catch(() => {});
  }

  console.log('\nDone. The Online tab will show these creators on the next page load.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
