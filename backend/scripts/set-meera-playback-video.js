#!/usr/bin/env node
/**
 * Flips `usePlaybackVideo: true` on @meera so the next incoming
 * call to her account publishes /playback/meera.mp4 (cropped 100px
 * from top and bottom in agora.js) as the outgoing video track
 * instead of her live camera.
 *
 * Dry-run by default; --apply commits.
 *
 *   cd backend
 *   node scripts/set-meera-playback-video.js          # preview
 *   node scripts/set-meera-playback-video.js --apply  # commit
 *
 * Same toggle is reachable from the admin user list (Playback pill
 * on her row) — this is just a CLI shortcut.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';

const TARGET_USERNAME = 'meera';
const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.MONGO_URI);

  const user = await User.findOne({ username: TARGET_USERNAME })
    .select('_id username displayName role usePlaybackVideo')
    .lean();
  if (!user) {
    console.error(`No user named @${TARGET_USERNAME} on this database.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (user.role !== 'provider') {
    console.error(
      `@${TARGET_USERNAME} is a "${user.role}" — only providers can have a playback video.`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(
    `\nTarget: @${user.username}  (${user.displayName || '—'})  role=${user.role}`,
  );
  console.log(`usePlaybackVideo: ${user.usePlaybackVideo ? 'true' : 'false'} → true`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  await User.updateOne({ _id: user._id }, { $set: { usePlaybackVideo: true } });
  console.log('\nFlag set. Bust profile cache so the change is visible immediately…');

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

  console.log(
    `\nDone. @${user.username}'s next incoming call will publish /playback/${user.username}.mp4 ` +
      `(crop 100px top + 100px bottom) instead of her camera.`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
