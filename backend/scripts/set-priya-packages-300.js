#!/usr/bin/env node
/**
 * Sets every package on priya@chatmeet.dev to a flat price of 300
 * credits. Durations, callType, title, description, and active flag
 * are left untouched — only `price` flips.
 *
 * Dry-run by default (prints what would change), --apply commits.
 *
 *   cd backend
 *   node scripts/set-priya-packages-300.js          # preview
 *   node scripts/set-priya-packages-300.js --apply  # commit
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';
import { Package } from '../src/models/package.model.js';

const TARGET_EMAIL = 'priya@chatmeet.dev';
const NEW_PRICE = 300;
const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.MONGO_URI);

  // Find Priya. Use a case-insensitive match in case the seed stored
  // it differently — emails in this project aren't case-normalised
  // at write time across all paths.
  const user = await User.findOne({
    email: new RegExp(`^${TARGET_EMAIL.replace(/[.+]/g, '\\$&')}$`, 'i'),
  })
    .select('_id username email displayName')
    .lean();

  if (!user) {
    console.error(`No user found with email ${TARGET_EMAIL}.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const packages = await Package.find({ providerId: user._id }).lean();
  if (!packages.length) {
    console.log(`@${user.username} has no packages — nothing to update.`);
    await mongoose.disconnect();
    return;
  }

  console.log(
    `\nTarget: @${user.username} (${user.email})  ` +
      `${user.displayName ? `· ${user.displayName}` : ''}`,
  );
  console.log(`Packages on file: ${packages.length}\n`);

  for (const p of packages) {
    const arrow = p.price === NEW_PRICE ? '=' : '→';
    console.log(
      `  ${(p.title || '(untitled)').padEnd(22)} ` +
        `${(p.callType || '?').padEnd(6)} ` +
        `${String(p.durationMinutes ?? '?').padStart(3)}m  ` +
        `${String(p.price).padStart(5)} ${arrow} ${NEW_PRICE}`,
    );
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — re-run with --apply to commit.`);
    await mongoose.disconnect();
    return;
  }

  const res = await Package.updateMany(
    { providerId: user._id },
    { $set: { price: NEW_PRICE } },
  );
  console.log(`\nUpdated ${res.modifiedCount} of ${res.matchedCount} package(s).`);

  // Bust the cached profile so the new prices render on her next
  // /users/:username fetch — the profile cache lives 60s otherwise.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    const dropped = await redis.del(`profile:${user.username}`);
    console.log(
      dropped
        ? `Cleared profile cache for @${user.username}.`
        : `No profile cache key for @${user.username} (already cold).`,
    );
  } finally {
    await redis.quit().catch(() => {});
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
