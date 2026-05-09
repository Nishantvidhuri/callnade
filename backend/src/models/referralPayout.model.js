import mongoose from 'mongoose';

/**
 * One row per 10% referral payout. Created the moment an admin
 * approves a top-up where the topping-up user has a `referredBy`.
 *
 *   userId          → the REFERRER who received the credits.
 *   referredUserId  → the user whose top-up triggered the payout.
 *                     Stored for admin auditing, but the public
 *                     /me/referral-payouts endpoint exposes only
 *                     the username (not the topped-up amount), so
 *                     referrers can't reverse-engineer how much a
 *                     specific friend recharged.
 *   walletRequestId → the original WalletRequest that approved.
 *   amount          → credits paid to the referrer.
 */
const referralPayoutSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    walletRequestId: {
      // Only set on `kind: 'topup'` rows; signup bonuses don't have
      // an originating wallet request.
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WalletRequest',
      default: null,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    // 'topup'        — 10% to the referrer when their referee tops up
    //                  (userId = referrer, referredUserId = the topper).
    // 'signup'       — one-time bonus to the referee at signup
    //                  (userId = referee,  referredUserId = the referrer).
    // 'creator-earn' — 10% of a referred CREATOR's call earnings, paid
    //                  to the referrer for 30 days from the creator's
    //                  signup. One row per finished call (not per
    //                  flush) — `amount` is the total accrued for the
    //                  call, no walletRequestId.
    kind: {
      type: String,
      enum: ['topup', 'signup', 'creator-earn'],
      default: 'topup',
      index: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

referralPayoutSchema.index({ userId: 1, _id: -1 });

export const ReferralPayout = mongoose.model('ReferralPayout', referralPayoutSchema);
