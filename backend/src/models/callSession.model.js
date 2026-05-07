import mongoose from 'mongoose';

const callSessionSchema = new mongoose.Schema(
  {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    calleeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', default: null },
    perMinuteRate: { type: Number, default: 0 },
    // What the caller paid in total for this call (subscriber-side total,
    // includes platform margin).
    totalBilled: { type: Number, default: 0 },
    // What the creator earned in total (caller paid minus platform margin).
    // Tracked separately so the billing/transactions ledger can show real
    // earnings without recomputing from PLATFORM_MARGIN at read time.
    totalEarned: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    durationSec: Number,
    endReason: {
      type: String,
      enum: ['hangup', 'rejected', 'missed', 'error', 'insufficient_credits'],
      default: 'hangup',
    },
  },
  { timestamps: true },
);

export const CallSession = mongoose.model('CallSession', callSessionSchema);
