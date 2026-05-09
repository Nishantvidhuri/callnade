#!/usr/bin/env node
/**
 * One-shot migration for the referral-wallet split. Before this
 * change, referral payouts (10% of each referee's top-up) landed
 * directly in the user's `walletBalance`. After the split, payouts
 * land in `referralWalletBalance` so they can be withdrawn
 * independently from the spendable wallet.
 *
 * Existing accounts that earned referrals before the split have:
 *   - referralEarnings:        N    (lifetime, correct)
 *   - referralWalletBalance:   0    (new field, never credited)
 *   - walletBalance:           ≥0   (got the N at some point, may
 *                                    have been spent on calls since)
 *
 * This script moves up to N credits from walletBalance into
 * referralWalletBalance. Capped at the user's current walletBalance
 * so we never push it negative — if a user already spent their
 * referral payouts on calls, we can only restore what they still
 * have. They keep whatever fraction they still had liquid; the rest
 * is considered already enjoyed.
 *
 * Idempotent: only touches users whose referralEarnings > 0 AND
 * referralWalletBalance === 0. A second run is a no-op.
 *
 * Usage:
 *   cd backend
 *   node scripts/migrate-referral-wallets.js          # dry-run
 *   node scripts/migrate-referral-wallets.js --apply  # commit
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../src/models/user.model.js';
import { env } from '../src/config/env.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log('connected to mongo');

  const candidates = await User.find({
    referralEarnings: { $gt: 0 },
    $or: [
      { referralWalletBalance: 0 },
      { referralWalletBalance: { $exists: false } },
    ],
  })
    .select('_id username walletBalance referralEarnings referralWalletBalance')
    .lean();

  console.log(`candidates needing migration: ${candidates.length}`);
  if (!candidates.length) {
    await mongoose.disconnect();
    return;
  }

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  const plan = candidates.map((u) => {
    const earnings = round2(u.referralEarnings);
    const walletBalance = round2(u.walletBalance);
    // Move at most what they still have liquid in the spendable wallet.
    const moveFromWallet = round2(Math.min(earnings, walletBalance));
    return {
      userId: String(u._id),
      username: u.username,
      walletBefore: walletBalance,
      referralEarnings: earnings,
      moveFromWallet,
      newWalletBalance: round2(walletBalance - moveFromWallet),
      newReferralWalletBalance: earnings,
      lostToSpend: round2(earnings - moveFromWallet),
    };
  });

  // Show a sample so the operator can sanity-check the math.
  console.log('plan (up to 10):', JSON.stringify(plan.slice(0, 10), null, 2));
  const totals = plan.reduce(
    (acc, p) => {
      acc.movedFromWallet += p.moveFromWallet;
      acc.creditedReferral += p.newReferralWalletBalance;
      acc.lostToSpend += p.lostToSpend;
      return acc;
    },
    { movedFromWallet: 0, creditedReferral: 0, lostToSpend: 0 },
  );
  console.log('\ntotals:', {
    movedFromWallet: round2(totals.movedFromWallet),
    creditedReferral: round2(totals.creditedReferral),
    lostToSpend: round2(totals.lostToSpend),
  });

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  let n = 0;
  for (const p of plan) {
    // Two atomic single-doc updates per user. We don't use $inc with
    // a fresh `referralWalletBalance` because the field may not exist
    // yet on legacy docs — $set is unambiguous.
    await User.updateOne(
      { _id: p.userId },
      {
        $set: {
          referralWalletBalance: p.newReferralWalletBalance,
          walletBalance: p.newWalletBalance,
        },
      },
    );
    n += 1;
  }

  console.log(`\nupdated ${n} user(s)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
