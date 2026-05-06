import mongoose from 'mongoose';

const packageSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 500 },
    price: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, default: null, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

packageSchema.index({ providerId: 1, createdAt: -1 });

export const Package = mongoose.model('Package', packageSchema);
