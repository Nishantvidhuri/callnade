// Rounds every user's walletBalance + earningsBalance to 2 decimals — fixes
// floating-point garbage like 9943.600000000002 left over from prior billing
// runs before round2() was applied on every write.
//
//   node scripts/round-balances.js

import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/user.model.js';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

async function main() {
  await mongoose.connect(env.MONGO_URI);

  const cursor = User.find({}).select('_id walletBalance earningsBalance').lean().cursor();
  let scanned = 0;
  let cleaned = 0;
  for await (const u of cursor) {
    scanned++;
    const w = u.walletBalance || 0;
    const e = u.earningsBalance || 0;
    const wRounded = round2(w);
    const eRounded = round2(e);
    if (w !== wRounded || e !== eRounded) {
      await User.updateOne(
        { _id: u._id },
        { $set: { walletBalance: wRounded, earningsBalance: eRounded } },
      );
      cleaned++;
    }
  }

  console.log(`Scanned ${scanned} users, cleaned ${cleaned}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
