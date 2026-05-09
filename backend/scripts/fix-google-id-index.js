#!/usr/bin/env node
/**
 * One-shot fix for the `googleId` unique-index collision.
 *
 * Old schema:
 *   googleId: { type: String, default: null, unique: true, sparse: true }
 *
 * The combination of `default: null` + `sparse: true` is broken —
 * MongoDB sparse indexes still include documents whose value is
 * explicitly null (sparse only skips documents where the field is
 * completely missing). Every non-Google signup wrote `googleId: null`
 * and collided on the unique constraint after the first such row.
 *
 * New schema:
 *   googleId: { type: String }
 *   userSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } })
 *
 * This script:
 *   1. Drops the existing `googleId_1` index (which still has the
 *      old options — Mongoose won't recreate an index that already
 *      exists, so the broken one persists across deploys).
 *   2. $unset's the `googleId` field on every doc where it's null,
 *      so those rows truly don't have the field anymore.
 *   3. (Index recreation happens automatically on backend boot via
 *      Mongoose's schema.index() declaration.)
 *
 * Usage:
 *   cd backend
 *   node scripts/fix-google-id-index.js          # dry-run
 *   node scripts/fix-google-id-index.js --apply  # actually run
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../src/models/user.model.js';
import { env } from '../src/config/env.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log('connected to mongo');

  const coll = User.collection;

  // 1. List current indexes
  const indexes = await coll.indexes();
  const googleIdx = indexes.find((i) => i.name === 'googleId_1');
  console.log('current googleId index:', googleIdx || '(none)');

  // 2. Count null/unset rows
  const nullCount = await User.countDocuments({
    $or: [{ googleId: null }, { googleId: { $exists: false } }],
  });
  const explicitNullCount = await User.countDocuments({ googleId: null });
  console.log(
    `users with googleId null/missing: ${nullCount} ` +
      `(of which ${explicitNullCount} have an explicit null value)`,
  );

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  // 3. Drop old index if present
  if (googleIdx) {
    try {
      await coll.dropIndex('googleId_1');
      console.log('dropped old googleId_1 index');
    } catch (err) {
      console.warn('drop failed:', err.message);
    }
  }

  // 4. Unset explicit null values so the new partial index has nothing
  //    to chew on for them.
  const res = await User.updateMany(
    { googleId: null },
    { $unset: { googleId: '' } },
  );
  console.log(`unset googleId on ${res.modifiedCount} doc(s)`);

  // 5. Re-create the new partial index (Mongoose normally does this on
  //    boot, but doing it here means the script is self-sufficient).
  await coll.createIndex(
    { googleId: 1 },
    {
      unique: true,
      partialFilterExpression: { googleId: { $type: 'string' } },
      name: 'googleId_1',
    },
  );
  console.log('created new partial-unique googleId index');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
