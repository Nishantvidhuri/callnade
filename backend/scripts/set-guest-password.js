#!/usr/bin/env node
/**
 * Set a real password on a guest account so the user can log in
 * from any browser via email + password (until now their only
 * session was the refresh-cookie on the browser that created them).
 *
 * Also flips `isGuest: false` because the moment they have a usable
 * password the account isn't really a "guest" anymore.
 *
 *   cd backend
 *   node scripts/set-guest-password.js                     # dry-run (uses defaults)
 *   node scripts/set-guest-password.js --apply             # commit
 *   node scripts/set-guest-password.js USERNAME PASSWORD   # override defaults
 *   node scripts/set-guest-password.js USERNAME PASSWORD --apply
 *
 * Defaults to: guest_of37exbrqz / password123
 */
import 'dotenv/config';
import argon2 from 'argon2';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';

const args = process.argv.slice(2).filter((a) => a !== '--apply');
const APPLY = process.argv.includes('--apply');
const TARGET_USERNAME = args[0] || 'guest_of37exbrqz';
const NEW_PASSWORD = args[1] || 'password123';

async function main() {
  if (NEW_PASSWORD.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }
  await mongoose.connect(env.MONGO_URI);

  const user = await User.findOne({ username: TARGET_USERNAME })
    .select('_id username email displayName role isGuest')
    .lean();
  if (!user) {
    console.error(`No user named @${TARGET_USERNAME} on this database.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\nTarget: @${user.username}  ${user.email || '(no email)'}  role=${user.role}`);
  console.log(`isGuest:        ${user.isGuest ? 'true' : 'false'} → false`);
  console.log(`New password:   ${NEW_PASSWORD} (will be argon2-hashed)`);
  console.log(`Login email:    ${user.email}  ← use this on /login`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await argon2.hash(NEW_PASSWORD, { type: argon2.argon2id });
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash, isGuest: false } },
  );

  console.log('\nPassword updated. Existing refresh-cookie session stays valid;');
  console.log(`the user can now also sign in fresh with ${user.email} / ${NEW_PASSWORD}.`);

  // Clear the cached profile so any flag change reflects on the
  // next /u/<username> fetch.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    await redis.del(`profile:${user.username}`).catch(() => {});
  } finally {
    await redis.quit().catch(() => {});
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
