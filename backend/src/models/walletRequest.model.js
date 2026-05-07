import mongoose from 'mongoose';

/**
 * Top-up + withdrawal requests. Both flows are admin-mediated for now
 * (no payment-gateway integration), so a request lands here as
 * `pending` and an admin manually moves the user's wallet/earnings
 * balance + flips the status to `approved` or `rejected`.
 *
 * Shape:
 *  - type === 'topup'    : user wants to add `amount` credits to their
 *                          wallet. They've sent the money via Paytm to
 *                          the platform's collection account; admin
 *                          verifies and credits.
 *  - type === 'withdraw' : creator wants to cash out `amount` credits
 *                          (or all earnings) to their UPI id. They
 *                          upload a QR screenshot to confirm the UPI
 *                          handle; admin pays out and debits earnings.
 *
 * QR images are embedded directly in the document as a Buffer (same
 * approach as Visit and Media for small assets — keeps the admin
 * tooling self-contained without an external blob store).
 */
const walletRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['topup', 'withdraw'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },

    // Withdraw-only fields.
    //  - upiId:        destination UPI handle for the payout.
    //  - qrUrl:        public R2/CDN URL of the user's payment QR
    //                  screenshot. Set on new uploads.
    //  - qrData:       legacy Buffer storage from before we moved
    //                  uploads to R2 — kept readable for old rows.
    //                  New rows write qrUrl only.
    //  - qrContentType: stays around for both paths so the admin
    //                  preview can hint the right MIME type.
    upiId: { type: String, default: null },
    qrUrl: { type: String, default: null },
    qrData: { type: Buffer, default: null, select: false },
    qrContentType: { type: String, default: null },

    // Topup-only field. Manual top-ups require the user to paste the
    // UPI reference / transaction id from their bank app so the admin
    // can match it against the platform's collection account before
    // crediting. Indexed so the admin panel can search by reference.
    referenceId: { type: String, default: null, index: true },

    // Topup-only field. The UPI handle the user paid FROM. Helps the
    // admin reconcile faster — the collection account's statement
    // shows the payer VPA, and a manual mismatch ("user said they
    // paid from X but the credit came from Y") is a strong signal of
    // a wrong reference.
    payerUpiId: { type: String, default: null },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    // Filled in when an admin actions the request.
    actionedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actionedAt: { type: Date, default: null },
    adminNote: { type: String, default: null },

    // Razorpay reference fields (only set on gateway-driven top-ups).
    // Stored on the request so the verify / poll endpoints can match
    // an inbound webhook or status check back to the right wallet
    // entry without needing a separate ledger table.
    gatewayOrderId: { type: String, default: null, index: true },
    gatewayPaymentId: { type: String, default: null, index: true },
    gatewayMethod: { type: String, default: null }, // 'upi-collect' | 'checkout'
    gatewayVpa: { type: String, default: null },
  },
  { timestamps: true },
);

walletRequestSchema.index({ createdAt: -1 });

export const WalletRequest = mongoose.model('WalletRequest', walletRequestSchema);
