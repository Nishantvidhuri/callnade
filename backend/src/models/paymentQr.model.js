import mongoose from 'mongoose';

/**
 * Pool of payment QR images shown on the user-side top-up form.
 * Admins upload as many as they want; the public read endpoint
 * picks one at random per page-load. Storing them as R2 URLs (not
 * raw bytes) keeps documents tiny.
 *
 *   url:           public CDN URL.
 *   contentType:   image/jpeg | image/png | image/webp.
 *   label:         optional human label (e.g. "Paytm primary").
 *   active:        only active QRs are eligible for the random pick.
 *   uploadedBy:    admin who added it (for audit).
 */
const paymentQrSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    contentType: { type: String, default: 'image/jpeg' },
    label: { type: String, default: null },
    // UPI handle the QR resolves to (e.g. callnade@paytm). Admin
    // sets this at upload; the topup form displays it under the QR
    // so users who don't want to scan can copy-paste instead.
    upiId: { type: String, default: null },
    active: { type: Boolean, default: true, index: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

paymentQrSchema.index({ active: 1, createdAt: -1 });

export const PaymentQr = mongoose.model('PaymentQr', paymentQrSchema);
