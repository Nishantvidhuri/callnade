// Adds 7 provider accounts with Indian-girl names + Pinterest avatars +
// one starter package each. Idempotent: re-running updates existing rows
// rather than creating duplicates.
//
//   node scripts/seed-indian-creators.js
//
// Login (any of them):  <username>@chatmeet.dev / password123

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

const PIN_1 = 'https://i.pinimg.com/1200x/6a/01/42/6a01427dc0f087fe23ce529634b45252.jpg';
const PIN_2 = 'https://i.pinimg.com/736x/32/22/5d/32225d03caefb5ec35a788a52985cf2a.jpg';
const PIN_3 = 'https://i.pinimg.com/736x/0d/8e/31/0d8e3141021d36d5d309637fe38b92fc.jpg';
const PIN_4 = 'https://i.pinimg.com/736x/11/15/97/111597d1117ee5af22fb484d939070d3.jpg';
const PIN_5 = 'https://i.pinimg.com/736x/04/f3/27/04f3274682f5110050fc2a7504636d95.jpg';
const PIN_6 = 'https://i.pinimg.com/736x/a3/94/c6/a394c673b4e93f68c242942fbc0483e2.jpg';

// Standard package menu — every creator offers the same set, only prices
// differ per creator. 30-min calls are priced above 250 credits.
const PACKAGE_MENU = {
  aanya:  [{ mins: 15, price: 180 }, { mins: 30, price: 320 }],
  diya:   [{ mins: 15, price: 160 }, { mins: 30, price: 280 }],
  ishita: [{ mins: 15, price: 200 }, { mins: 30, price: 360 }],
  kavya:  [{ mins: 15, price: 170 }, { mins: 30, price: 300 }],
  meera:  [{ mins: 15, price: 220 }, { mins: 30, price: 400 }],
  priya:  [{ mins: 15, price: 150 }, { mins: 30, price: 270 }],
};

const buildPackages = (username) =>
  (PACKAGE_MENU[username] || [{ mins: 30, price: 300 }]).map(({ mins, price }) => ({
    title: `${mins}-min video call`,
    description: `Live ${mins}-minute video call`,
    price,
    durationMinutes: mins,
  }));

const CREATORS = [
  {
    username: 'aanya',
    displayName: 'Aanya Kapoor',
    bio: 'Mumbai-based dancer & content creator. Bollywood routines on weekends 💃',
    avatar: PIN_1,
    packages: buildPackages('aanya'),
  },
  {
    username: 'diya',
    displayName: 'Diya Sharma',
    bio: 'Stylist, foodie, weekend traveler. Dilli-girl at heart 🌸',
    avatar: PIN_2,
    packages: buildPackages('diya'),
  },
  {
    username: 'ishita',
    displayName: 'Ishita Verma',
    bio: 'Yoga teacher · skincare nerd · sunset chaser 🧘‍♀️',
    avatar: PIN_3,
    packages: buildPackages('ishita'),
  },
  {
    username: 'kavya',
    displayName: 'Kavya Iyer',
    bio: 'Carnatic singer & music coach from Chennai 🎤',
    avatar: PIN_4,
    packages: buildPackages('kavya'),
  },
  {
    username: 'meera',
    displayName: 'Meera Reddy',
    bio: 'Photographer · espresso lover · Bangalore weekends 📸',
    avatar: PIN_5,
    packages: buildPackages('meera'),
  },
  {
    username: 'priya',
    displayName: 'Priya Singh',
    bio: 'Chef cooking up family recipes & street food 🍛',
    avatar: PIN_6,
    packages: buildPackages('priya'),
  },
];

async function ensureUser({ username, displayName, bio }) {
  const email = `${username}@chatmeet.dev`;
  let user = await User.findOne({ $or: [{ email }, { username }] });
  if (user) {
    user.displayName = displayName;
    user.bio = bio;
    user.role = 'provider';
    user.isAdmin = false;
    user.banned = false;
    if (user.walletBalance == null) user.walletBalance = 0;
    if (user.earningsBalance == null) user.earningsBalance = 0;
    await user.save();
    return { user, created: false };
  }
  const passwordHash = await argon2.hash(PASSWORD, ARGON_OPTS);
  user = await User.create({
    email,
    username,
    displayName,
    bio,
    passwordHash,
    isPrivate: true,
    role: 'provider',
    isAdmin: false,
  });
  return { user, created: true };
}

async function setAvatarFromUrl(user, url) {
  // Replace any existing avatar media with one that points to the external
  // image URL. variantUrl()/avatarThumb() pass http(s) URLs through.
  await Media.deleteMany({ userId: user._id, type: 'avatar' });
  const avatar = await Media.create({
    userId: user._id,
    type: 'avatar',
    position: 0,
    visibility: 'public',
    contentType: 'image/jpeg',
    width: 736,
    height: 736,
    variants: { thumb: url, full: url },
    status: 'ready',
  });
  user.avatarMediaId = avatar._id;
  await user.save();
}

async function setPackages(user, packages) {
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

async function main() {
  await mongoose.connect(env.MONGO_URI);

  let created = 0;
  for (const c of CREATORS) {
    const { user, created: wasCreated } = await ensureUser(c);
    if (wasCreated) created++;
    await setAvatarFromUrl(user, c.avatar);
    await setPackages(user, c.packages);
    console.log(
      `  ${wasCreated ? '✓ created  ' : '· refreshed'}  @${user.username.padEnd(9)} ${c.displayName}`,
    );
  }

  console.log(`\nDone. ${created} new account${created === 1 ? '' : 's'}, ${CREATORS.length} creators ready.`);
  console.log(`Login with any: <username>@chatmeet.dev / ${PASSWORD}`);
  console.log('Examples: aanya@chatmeet.dev | diya@chatmeet.dev | priya@chatmeet.dev');

  // Bust cached lists so the new creators surface immediately.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true });
  try {
    await redis.connect();
    const profileKeys = await redis.keys('profile:*');
    const keysToDelete = ['popular:top', 'popular:providers:v2', ...profileKeys];
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
