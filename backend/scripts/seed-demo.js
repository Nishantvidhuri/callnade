import 'dotenv/config';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';
import { Media } from '../src/models/media.model.js';
import { Package } from '../src/models/package.model.js';

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
const PASSWORD = 'password123';

// The old western demo users (emma, noah, ava, ...) were removed in favor of
// the Indian-creator seed. seed:demo now only ensures the admin account
// exists. Run `npm run seed:indian` for the creator population.
const PEOPLE = [];

const avatarUrl = (slug) => `https://picsum.photos/seed/${slug}_avatar/400/400`;
const galleryUrl = (slug, i) => `https://picsum.photos/seed/${slug}_g${i}/600/800`;

async function ensureUser({ username, displayName, bio, email, password = PASSWORD, role = 'user' }) {
  const finalEmail = email || `${username}@chatmeet.dev`;
  let user = await User.findOne({ $or: [{ email: finalEmail }, { username }] });
  if (user) {
    user.displayName = displayName;
    user.bio = bio;
    user.role = role;
    user.isAdmin = role === 'admin';
    await user.save();
    return { user, created: false };
  }
  const passwordHash = await argon2.hash(password, ARGON_OPTS);
  user = await User.create({
    email: finalEmail,
    username,
    displayName,
    bio,
    passwordHash,
    isPrivate: true,
    role,
    isAdmin: role === 'admin',
  });
  return { user, created: true };
}

async function seedPackagesFor(user, packages = []) {
  await Package.deleteMany({ providerId: user._id });
  if (!packages.length) return;
  await Package.insertMany(
    packages.map((p) => ({
      providerId: user._id,
      title: p.title,
      description: p.description || '',
      price: p.price,
      durationMinutes: p.durationMinutes ?? null,
      active: true,
    })),
  );
}

async function seedMediaFor(user) {
  await Media.deleteMany({ userId: user._id });

  const avatar = await Media.create({
    userId: user._id,
    type: 'avatar',
    position: 0,
    visibility: 'public',
    s3Key: `seed/${user._id}/avatar.jpg`,
    contentType: 'image/jpeg',
    width: 400,
    height: 400,
    variants: {
      thumb: avatarUrl(user.username),
      full: avatarUrl(user.username),
    },
    status: 'ready',
  });

  user.avatarMediaId = avatar._id;
  await user.save();

  const galleryDocs = Array.from({ length: 9 }, (_, i) => ({
    userId: user._id,
    type: 'gallery',
    position: i,
    visibility: i < 3 ? 'public' : 'locked',
    s3Key: `seed/${user._id}/g${i}.jpg`,
    contentType: 'image/jpeg',
    width: 600,
    height: 800,
    variants: {
      thumb: galleryUrl(user.username, i),
      full: galleryUrl(user.username, i),
      blurred: galleryUrl(user.username, i),
    },
    status: 'ready',
  }));
  await Media.insertMany(galleryDocs);
}

async function main() {
  await mongoose.connect(env.MONGO_URI);

  // Admin
  const { user: adminUser, created: adminCreated } = await ensureUser({
    username: 'admin',
    displayName: 'Admin',
    bio: 'Administrator',
    email: 'admin@chatmeet.dev',
    password: 'admin123',
    role: 'admin',
  });
  await seedMediaFor(adminUser);
  console.log(`  ${adminCreated ? '✓ created' : '· refreshed'}  @${adminUser.username.padEnd(11)}  Admin (admin)`);

  let createdCount = adminCreated ? 1 : 0;
  for (const person of PEOPLE) {
    const { user, created } = await ensureUser(person);
    if (created) createdCount++;
    await seedMediaFor(user);
    if (person.role === 'provider') {
      await seedPackagesFor(user, person.packages || []);
    }
    const tag = person.role === 'provider' ? '[provider]' : '';
    console.log(`  ${created ? '✓ created' : '· refreshed'}  @${user.username.padEnd(11)}  ${person.displayName} ${tag}`);
  }

  console.log(`\nDone. ${createdCount} new account${createdCount === 1 ? '' : 's'}, ${PEOPLE.length + 1} total ready.`);
  console.log(`Login with any:  <username>@chatmeet.dev / ${PASSWORD}`);
  console.log('Examples:        emma@chatmeet.dev   |   noah@chatmeet.dev   |   sophia@chatmeet.dev');
  console.log('Admin:           admin@chatmeet.dev / admin123');

  // Invalidate caches so the new accounts surface immediately
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    const profileKeys = await redis.keys('profile:*');
    const keysToDelete = ['popular:top', ...profileKeys];
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
