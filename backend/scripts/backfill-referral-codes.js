#!/usr/bin/env node
/**
 * One-shot backfill: assigns a unique random referralCode to every
 * user that doesn't already have one. Idempotent — re-running after
 * everyone has a code is a no-op.
 *
 * Usage:
 *   cd backend
 *   node scripts/backfill-referral-codes.js          # dry-run
 *   node scripts/backfill-referral-codes.js --apply  # actually write
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../src/models/user.model.js';
import { env } from '../src/config/env.js';
import { mintReferralCode } from '../src/services/auth.service.js';

const APPLY = process.argv.includes('--apply');
const BATCH = 500; // users per progress log line

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log('connected to mongo');

  // `null`, missing, or empty-string all need a code.
  const filter = {
    $or: [
      { referralCode: null },
      { referralCode: { $exists: false } },
      { referralCode: '' },
    ],
  };

  const total = await User.countDocuments(filter);
  console.log(`users without a referralCode: ${total}`);
  if (total === 0) {
    await mongoose.disconnect();
    return;
  }
  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to actually assign codes.');
    await mongoose.disconnect();
    return;
  }

  const cursor = User.find(filter).select('_id').lean().cursor();
  let n = 0;
  let failed = 0;
  for await (const doc of cursor) {
    try {
      const code = await mintReferralCode();
      // Atomic single-doc update (skips full-doc Mongoose validation,
      // which is fine since we're only setting one field).
      await User.updateOne({ _id: doc._id }, { $set: { referralCode: code } });
      n += 1;
      if (n % BATCH === 0) {
        console.log(`assigned ${n} / ${total}`);
      }
    } catch (err) {
      // E11000 (unique violation) on a freshly-minted 8-char code is
      // astronomically unlikely but possible — log and continue. The
      // doc stays without a code; re-run the script to retry.
      failed += 1;
      console.warn(`skipped user ${doc._id}: ${err.message}`);
    }
  }

  console.log(`\nassigned ${n} / ${total} (${failed} failed, retry by re-running)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
