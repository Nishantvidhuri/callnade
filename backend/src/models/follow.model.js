import mongoose from 'mongoose';

const followSchema = new mongoose.Schema(
  {
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    followee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

followSchema.index({ follower: 1, followee: 1 }, { unique: true });
followSchema.index({ followee: 1, createdAt: -1 });

export const Follow = mongoose.model('Follow', followSchema);
