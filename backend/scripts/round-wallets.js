#!/usr/bin/env node
/**
 * Floor-clamp + round to 2 decimals on any drifted wallet /
 * earnings balance. The 1Hz billing ticker uses floating-point
 * arithmetic and occasionally drifts a fraction of a cent below
 * zero (-0.0001 etc.). The User schema's `min: 0` then rejects any
 * subsequent `user.save()`, which 500s login + other writes for
 * that account.
 *
 *   cd backend
 *   node scripts/round-wallets.js          # dry-run preview
 *   node scripts/round-wallets.js --apply  # commit
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';

const APPLY = process.argv.includes('--apply');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function main() {
  await mongoose.connect(env.MONGO_URI);

  // Anything that fails `min: 0` validation OR has more decimals
  // than 2 sig figs gets fixed. Cheap to scan — small platform.
  const users = await User
    .find({})
    .select('_id username walletBalance earningsBalance referralWalletBalance referralEarnings')
    .lean();

  const fixes = [];
  for (const u of users) {
    const next = {
      walletBalance: Math.max(0, round2(u.walletBalance)),
      earningsBalance: Math.max(0, round2(u.earningsBalance)),
      referralWalletBalance: Math.max(0, round2(u.referralWalletBalance)),
      referralEarnings: Math.max(0, round2(u.referralEarnings)),
    };
    const changed =
      next.walletBalance !== (u.walletBalance || 0) ||
      next.earningsBalance !== (u.earningsBalance || 0) ||
      next.referralWalletBalance !== (u.referralWalletBalance || 0) ||
      next.referralEarnings !== (u.referralEarnings || 0);
    if (changed) fixes.push({ id: u._id, username: u.username, before: u, after: next });
  }

  if (!fixes.length) {
    console.log('All balances are clean — nothing to fix.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${fixes.length} account(s) with drifted balances:`);
  for (const f of fixes) {
    console.log(
      `  @${f.username.padEnd(16)}  ` +
        `wallet ${(f.before.walletBalance || 0)} → ${f.after.walletBalance}, ` +
        `earnings ${(f.before.earningsBalance || 0)} → ${f.after.earningsBalance}`,
    );
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  for (const f of fixes) {
    await User.updateOne({ _id: f.id }, { $set: f.after });
  }
  console.log(`\nFixed ${fixes.length} account(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
