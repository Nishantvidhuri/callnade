// Hard-removes the listed users + everything they own (media, packages,
// follow edges, call sessions). Run after confirming you really want them
// gone — there is no undo.
//
//   node scripts/remove-users.js
//
// Edit USERNAMES below to change the target list.

import 'dotenv/config';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';
import { Media } from '../src/models/media.model.js';
import { Package } from '../src/models/package.model.js';
import { Follow } from '../src/models/follow.model.js';
import { FollowRequest } from '../src/models/followRequest.model.js';
import { CallSession } from '../src/models/callSession.model.js';

const USERNAMES = [
  'siasharma6450',
  'charlotte',
  'gallery0',
  'gallery',
  'emma',
  'noah',
  'riya',
  // Old demo users from seed:demo
  'ava',
  'liam',
  'sophia',
  'lucas',
  'mia',
  'ethan',
  'isabella',
  'mason',
  'olivia',
  'james',
  'amelia',
  'ben',
];

async function main() {
  await mongoose.connect(env.MONGO_URI);

  const users = await User.find({ username: { $in: USERNAMES } })
    .select('_id username displayName')
    .lean();

  if (!users.length) {
    console.log('No matching users found. Usernames:', USERNAMES.join(', '));
    await mongoose.disconnect();
    return;
  }

  const ids = users.map((u) => u._id);
  console.log(`Removing ${users.length} user(s):`);
  for (const u of users) {
    console.log(`  · @${u.username}  ${u.displayName || ''}`);
  }

  // Cascade — order doesn't really matter, but keep it predictable.
  const [media, pkgs, follows, frs, calls, removed] = await Promise.all([
    Media.deleteMany({ userId: { $in: ids } }),
    Package.deleteMany({ providerId: { $in: ids } }),
    Follow.deleteMany({ $or: [{ follower: { $in: ids } }, { followee: { $in: ids } }] }),
    FollowRequest.deleteMany({ $or: [{ from: { $in: ids } }, { to: { $in: ids } }] }),
    CallSession.deleteMany({ $or: [{ callerId: { $in: ids } }, { calleeId: { $in: ids } }] }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);

  console.log('\nDeletion summary:');
  console.log(`  users          ${removed.deletedCount}`);
  console.log(`  media          ${media.deletedCount}`);
  console.log(`  packages       ${pkgs.deletedCount}`);
  console.log(`  follows        ${follows.deletedCount}`);
  console.log(`  follow reqs    ${frs.deletedCount}`);
  console.log(`  call sessions  ${calls.deletedCount}`);

  // Bust caches that may still reference the removed users.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    const profileKeys = await redis.keys('profile:*');
    const presenceKeys = ids.flatMap((id) => [`presence:${String(id)}`]);
    const keysToDelete = [
      'popular:top',
      'popular:providers:v2',
      ...profileKeys,
      ...presenceKeys,
    ];
    if (keysToDelete.length) await redis.del(...keysToDelete);
    console.log(`Cleared ${keysToDelete.length} cache keys.`);
  } finally {
    await redis.quit().catch(() => {});
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
