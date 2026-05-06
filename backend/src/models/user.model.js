import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_]+$/,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 280 },
    avatarMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    // Live-camera selfie captured at signup. Stored privately (locked
    // visibility) so admins can confirm the user is real, but not exposed
    // publicly. Set once and never overwritten by the user.
    verificationMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    verifiedAt: { type: Date, default: null },
    isPrivate: { type: Boolean, default: true },
    followerCount: { type: Number, default: 0, index: true },
    followingCount: { type: Number, default: 0 },
    popularityScore: { type: Number, default: 0, index: true },
    refreshTokenVersion: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: null },
    isAdmin: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ['user', 'provider', 'admin'],
      default: 'user',
      index: true,
    },
    banned: { type: Boolean, default: false },
    bannedAt: { type: Date, default: null },
    // Soft-delete: account hidden from every public listing and prevented
    // from logging in. Restorable by admins. Data is retained for audit.
    deletedAt: { type: Date, default: null, index: true },
    walletBalance: { type: Number, default: 0, min: 0 },
    earningsBalance: { type: Number, default: 0, min: 0 },
    dateOfBirth: { type: Date, default: null },
    // Provider-set flag — when true the creator is listed in the "18+"
    // section instead of the normal Discover tab. Indexed for fast
    // segmentation queries.
    isAdult: { type: Boolean, default: false, index: true },
    // Snapshot of the T&C / community-guidelines consent the user accepted
    // at signup. Stored verbatim for legal record. version pins the
    // document revision they actually saw.
    consent: {
      fullName: { type: String, default: null },
      signature: { type: String, default: null },
      acceptedAt: { type: Date, default: null },
      version: { type: String, default: null },
      ip: { type: String, default: null },
      // Generated PDF rendering of the consent form filled with the user's
      // info. Buffer kept off the default projection so list queries don't
      // pull megabytes per row.
      pdfData: { type: Buffer, select: false },
      pdfBytes: { type: Number, default: null },
    },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.refreshTokenVersion;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
