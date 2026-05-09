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
    // Provider-controlled "available right now" flag. When true the
    // creator opts in to taking calls and is visible in the online
    // list; when false they're hidden from discovery surfaces (the
    // online section, search if we wire it). Indexed for fast filter
    // on the home grid.
    isActive: { type: Boolean, default: true, index: true },
    // Google OAuth sub (the immutable Google account id). Set on
    // accounts that signed up / linked via Sign-in-with-Google. We
    // also keep email-based lookup so a user can use either method.
    //
    // No `default: null` — the field is left unset for non-Google
    // signups. Combined with the partial-filter unique index defined
    // below, this prevents the "every null collides" bug a sparse
    // index has when documents explicitly store `null`.
    googleId: { type: String },
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

    // Referral system.
    //  - referralCode:      this user's own shareable code, generated
    //                       randomly at signup (8 chars, no ambiguous
    //                       glyphs like 0/O 1/I/l). Unique + sparse —
    //                       legacy users without one don't break the
    //                       index.
    //  - referredBy:        the user who referred this account (set
    //                       at signup if a valid referral code was
    //                       supplied; never overwritten).
    //  - referralCount:     how many people THIS user has referred.
    //  - referralEarnings:  lifetime credits earned via referrals
    //                       (for display; the actual money is in
    //                       walletBalance).
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    referralCount: { type: Number, default: 0 },
    // Lifetime cumulative — never decreased on withdraw. Displayed
    // on the Refer & earn card so the user sees how much their
    // referrals have generated overall.
    referralEarnings: { type: Number, default: 0 },
    // Current spendable / withdrawable referral balance. Increased
    // on each approved top-up by a referee, decreased only when an
    // admin approves a referral-source withdrawal. Kept separate
    // from `walletBalance` so the user can't accidentally burn
    // their referral payout on calls — and so regular (non-creator)
    // users have something to withdraw at all (they have no
    // earningsBalance).
    referralWalletBalance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Partial unique index on googleId — only documents where googleId is
// an actual string get indexed. Missing / null docs are ignored, so
// every non-Google account can coexist without colliding on the
// unique constraint. (Plain `sparse: true` doesn't work here because
// MongoDB sparse indexes still include explicitly-null values.)
userSchema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: { googleId: { $type: 'string' } },
  },
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
