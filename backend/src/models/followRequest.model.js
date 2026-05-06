import mongoose from 'mongoose';

const followRequestSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

followRequestSchema.index({ from: 1, to: 1 }, { unique: true });
followRequestSchema.index({ to: 1, createdAt: -1 });

export const FollowRequest = mongoose.model('FollowRequest', followRequestSchema);
