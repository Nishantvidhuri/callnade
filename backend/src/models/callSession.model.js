import mongoose from 'mongoose';

const callSessionSchema = new mongoose.Schema(
  {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    calleeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', default: null },
    perMinuteRate: { type: Number, default: 0 },
    totalBilled: { type: Number, default: 0 },
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
