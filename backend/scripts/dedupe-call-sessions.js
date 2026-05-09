#!/usr/bin/env node
/**
 * One-shot cleanup of duplicate CallSession rows produced by the
 * pre-fix endCall re-entry bug. Two `endCall(callId)` calls firing
 * concurrently both passed the `if (!calls.get(callId)) return` check
 * because `calls.delete(callId)` only ran after `await recordSession`,
 * so the same call was recorded twice in `callsessions`.
 *
 * Two identical rows look like: same callerId, calleeId, startedAt
 * (down to the millisecond — both inserts come from the same
 * in-memory `c.startedAt`). We group by those three fields, keep the
 * earliest `_id` per cluster, delete the rest.
 *
 * Usage:
 *   cd backend
 *   node scripts/dedupe-call-sessions.js          # dry-run by default
 *   node scripts/dedupe-call-sessions.js --apply  # actually delete
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { CallSession } from '../src/models/callSession.model.js';
import { env } from '../src/config/env.js';

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(env.MONGO_URI);
  console.log('connected to mongo');

  const dupes = await CallSession.aggregate([
    {
      $group: {
        _id: {
          callerId: '$callerId',
          calleeId: '$calleeId',
          startedAt: '$startedAt',
        },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);

  if (!dupes.length) {
    console.log('no duplicates found — nothing to do');
    await mongoose.disconnect();
    return;
  }

  // Per-cluster: sort ids ascending and keep the first; delete the rest.
  // (ObjectIds sort by creation time, so the "first" is the original
  // insertion. We delete the late twins.)
  const toDelete = [];
  for (const d of dupes) {
    const sorted = d.ids
      .map((id) => id.toString())
      .sort()
      .map((s) => new mongoose.Types.ObjectId(s));
    toDelete.push(...sorted.slice(1));
  }

  console.log(
    `found ${dupes.length} duplicate cluster(s), ${toDelete.length} stale row(s)`,
  );
  console.log(
    'sample clusters (up to 5):',
    JSON.stringify(dupes.slice(0, 5), null, 2),
  );

  if (!APPLY) {
    console.log('\nDRY RUN — no rows deleted. Re-run with --apply to commit.');
    await mongoose.disconnect();
    return;
  }

  const res = await CallSession.deleteMany({ _id: { $in: toDelete } });
  console.log(`deleted ${res.deletedCount} duplicate CallSession row(s)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
