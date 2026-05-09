#!/usr/bin/env node
/**
 * One-shot backfill: synthesize `ReferralPayout` rows for top-ups
 * that were approved BEFORE the referral-history feature shipped.
 *
 * For each approved WalletRequest of type='topup' where the topping
 * up user has a `referredBy`, we create a corresponding payout row
 * (10% of the top-up amount) so the referrer's "Show payouts to me"
 * history surfaces them. Idempotent — skips any walletRequestId
 * that already has a payout row.
 *
 * Note: this fires payouts at the historical 10% rate. If you ever
 * change `REFERRAL_RATE`, only forward-going payouts use the new
 * rate; this script reflects what was credited at the time, which
 * for the entire pre-split history was 10%.
 *
 * Usage:
 *   cd backend
 *   node scripts/backfill-referral-payouts.js          # dry-run
 *   node scripts/backfill-referral-payouts.js --apply  # commit
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { WalletRequest } from '../src/models/walletRequest.model.js';
import { ReferralPayout } from '../src/models/referralPayout.model.js';
import { User } from '../src/models/user.model.js';
import { env } from '../src/config/env.js';

const APPLY = process.argv.includes('--apply');
const REFERRAL_RATE = 0.1;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log('connected to mongo');

  // Pull every approved topup. We could be tighter (`amount > 0`,
  // `userId not null`) but topup approvals always have those.
  const topups = await WalletRequest.find({
    type: 'topup',
    status: 'approved',
  })
    .select('_id userId amount actionedAt createdAt')
    .sort({ _id: 1 })
    .lean();

  console.log(`approved topups in DB: ${topups.length}`);
  if (!topups.length) {
    await mongoose.disconnect();
    return;
  }

  // Skip topups that already have a payout row.
  const requestIds = topups.map((t) => t._id);
  const existing = await ReferralPayout.find({
    walletRequestId: { $in: requestIds },
  })
    .select('walletRequestId')
    .lean();
  const seenRequestIds = new Set(existing.map((r) => String(r.walletRequestId)));

  // Lookup each topping-up user's referredBy in one round-trip.
  const userIds = [...new Set(topups.map((t) => String(t.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('_id username referredBy')
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const plan = [];
  for (const t of topups) {
    if (seenRequestIds.has(String(t._id))) continue; // already backfilled
    const u = userMap.get(String(t.userId));
    if (!u || !u.referredBy) continue; // user wasn't referred — no payout
    const amount = round2((t.amount || 0) * REFERRAL_RATE);
    if (amount <= 0) continue;
    plan.push({
      userId: String(u.referredBy),
      referredUserId: String(t.userId),
      walletRequestId: String(t._id),
      amount,
      createdAt: t.actionedAt || t.createdAt,
      _refereeUsername: u.username,
    });
  }

  console.log(`new payout rows to create: ${plan.length}`);
  if (plan.length) {
    console.log('sample (up to 5):', JSON.stringify(plan.slice(0, 5), null, 2));
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  if (plan.length === 0) {
    console.log('nothing to do');
    await mongoose.disconnect();
    return;
  }

  // Strip the helper field before insert.
  const docs = plan.map(({ _refereeUsername, ...rest }) => rest);
  const res = await ReferralPayout.insertMany(docs, { ordered: false });
  console.log(`inserted ${res.length} payout row(s)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
