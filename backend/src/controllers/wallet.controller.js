import * as walletService from '../services/wallet.service.js';
import * as paymentQrService from '../services/paymentQr.service.js';

/**
 * Top-up flow accepts EITHER:
 *   - JSON body { amount, referenceId, payerUpiId }
 *   - Raw image bytes (jpeg/png/webp) with the same fields in the
 *     query string — same shape as /wallet/withdraw and /media/upload.
 *
 * The route is mounted twice in wallet.routes.js so each variant gets
 * the right body parser; this handler just normalises both into the
 * service call.
 */
export async function topup(req, res) {
  const isImageUpload =
    req.is('image/jpeg') || req.is('image/png') || req.is('image/webp');

  const fields = isImageUpload
    ? {
        amount: Number(req.query.amount),
        referenceId: req.query.referenceId,
        payerUpiId: req.query.payerUpiId,
      }
    : {
        amount: req.body?.amount,
        referenceId: req.body?.referenceId,
        payerUpiId: req.body?.payerUpiId,
      };

  res.json(
    await walletService.createTopupRequest(
      req.user.id,
      fields,
      isImageUpload ? req.body : null,
      isImageUpload ? req.headers['content-type'] || null : null,
    ),
  );
}

/**
 * The QR screenshot is sent as the raw request body (express.raw) and
 * the textual fields ride along as query params. This matches the
 * existing /media/upload pattern and keeps the upload as a single round
 * trip with no multipart parsing.
 */
export async function withdraw(req, res) {
  const { amount, upiId, source } = req.query;
  const contentType = req.headers['content-type'] || '';
  res.json(
    await walletService.createWithdrawRequest(
      req.user.id,
      { amount: Number(amount), upiId, source },
      req.body, // raw Buffer thanks to express.raw
      contentType,
    ),
  );
}

export async function myRequests(req, res) {
  res.json(await walletService.listMyRequests(req.user.id));
}

export async function paymentQr(_req, res) {
  res.json(await paymentQrService.pickRandomActiveQr());
}

export async function myReferralPayouts(req, res) {
  const { cursor, limit, direction } = req.query || {};
  res.json(
    await walletService.listMyReferralPayouts(req.user.id, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      direction: direction === 'sent' ? 'sent' : 'received',
    }),
  );
}

export async function createOrder(req, res) {
  res.json(
    await walletService.createRazorpayOrder(req.user.id, {
      amount: Number(req.body?.amount),
    }),
  );
}

export async function verifyOrder(req, res) {
  res.json(
    await walletService.verifyRazorpayPayment(req.user.id, {
      walletRequestId: req.body?.walletRequestId,
      razorpayOrderId: req.body?.razorpayOrderId,
      razorpayPaymentId: req.body?.razorpayPaymentId,
      razorpaySignature: req.body?.razorpaySignature,
    }),
  );
}

export async function upiCollect(req, res) {
  res.json(
    await walletService.createUpiCollect(req.user.id, {
      amount: Number(req.body?.amount),
      vpa: req.body?.vpa,
      phone: req.body?.phone,
    }),
  );
}

export async function pollStatus(req, res) {
  const { walletRequestId } = req.query;
  res.json(await walletService.pollWalletRequestStatus(req.user.id, walletRequestId));
}
