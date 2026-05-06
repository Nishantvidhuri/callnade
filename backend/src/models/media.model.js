import mongoose from 'mongoose';

// Variants are either:
//   - true (boolean) → bytes live in <variant>Data on this doc, served via /raw
//   - an absolute http(s):// URL → external image (used by seed for demo data)
//   - falsy → variant not available
// Mixed lets us store either shape transparently.
const variantFlagsSchema = new mongoose.Schema(
  {
    thumb: { type: mongoose.Schema.Types.Mixed, default: false },
    full: { type: mongoose.Schema.Types.Mixed, default: false },
    blurred: { type: mongoose.Schema.Types.Mixed, default: false },
  },
  { _id: false },
);

const mediaSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['avatar', 'gallery', 'verification'], required: true },
    position: { type: Number, default: 0 },
    visibility: { type: String, enum: ['public', 'locked'], default: 'public' },
    // Legacy: still kept for older docs migrated from R2/S3. Optional now.
    s3Key: { type: String },
    contentType: String,
    bytes: Number,
    width: Number,
    height: Number,
    variants: { type: variantFlagsSchema, default: () => ({}) },
    // Raw image bytes stored directly in Mongo. select:false so list/find
    // queries never accidentally pull megabytes per row.
    originalData: { type: Buffer, select: false },
    thumbData: { type: Buffer, select: false },
    fullData: { type: Buffer, select: false },
    blurredData: { type: Buffer, select: false },
    status: { type: String, enum: ['pending', 'processing', 'ready', 'failed'], default: 'pending' },
    error: String,
  },
  { timestamps: true },
);

mediaSchema.index({ userId: 1, type: 1, position: 1 });

export const Media = mongoose.model('Media', mediaSchema);
