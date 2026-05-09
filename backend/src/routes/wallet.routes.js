import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as wallet from '../controllers/wallet.controller.js';

export const router = Router();

// Top-up accepts EITHER:
//   - application/json body  { amount, referenceId, payerUpiId }
//   - image/{jpeg,png,webp}  body with fields in the query string,
//     plus an image attached as raw bytes (payment screenshot).
//
// Both content types funnel into wallet.topup, which validates the
// fields in the service layer (instead of wiring two zod schemas on
// the same path). uploadLimiter only kicks in for the image variant.
const topupImageBody = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '5mb',
});
router.post(
  '/topup',
  requireAuth,
  uploadLimiter,
  topupImageBody,
  asyncHandler(wallet.topup),
);

// Razorpay top-up flow:
//   1) POST /wallet/order  → server creates a Razorpay order, returns
//      orderId + keyId for the browser to launch checkout with.
//   2) POST /wallet/verify → browser posts the signed payment payload
//      back, server verifies HMAC + credits the wallet atomically.
const orderSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
  }),
});
const verifySchema = z.object({
  body: z.object({
    walletRequestId: z.string().min(1),
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  }),
});
router.post('/order', requireAuth, validate(orderSchema), asyncHandler(wallet.createOrder));
router.post('/verify', requireAuth, validate(verifySchema), asyncHandler(wallet.verifyOrder));

// UPI Collect (S2S): user enters their UPI ID or phone, server pushes a
// "collect" request via Razorpay so the user gets a prompt inside their
// UPI app. /poll-status is hit by the browser every few seconds while
// waiting for the user to approve.
const upiSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
    vpa: z.string().min(2).max(120),
    phone: z.string().max(20).optional(),
  }),
});
router.post('/upi-collect', requireAuth, validate(upiSchema), asyncHandler(wallet.upiCollect));
router.get('/poll-status', requireAuth, asyncHandler(wallet.pollStatus));

// Withdraw: raw image bytes in body + amount/upiId in query string.
// Same shape as POST /media/upload so the frontend can reuse the
// established direct-upload pattern.
const qrBody = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '5mb',
});
router.post('/withdraw', requireAuth, uploadLimiter, qrBody, asyncHandler(wallet.withdraw));

router.get('/requests', requireAuth, asyncHandler(wallet.myRequests));
router.get('/referral-payouts', requireAuth, asyncHandler(wallet.myReferralPayouts));
// Public-but-auth'd: returns one random active payment QR for the
// topup page to display. Picks a fresh one on every page load.
router.get('/payment-qr', requireAuth, asyncHandler(wallet.paymentQr));
