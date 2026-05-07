import crypto from 'crypto';
import Razorpay from 'razorpay';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import mongoose from 'mongoose';
import { WalletRequest } from '../models/walletRequest.model.js';
import { User } from '../models/user.model.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { s3, S3_BUCKET, CDN_BASE_URL } from '../config/s3.js';
import { badRequest, internal } from '../utils/HttpError.js';

const ALLOWED_QR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_QR_BYTES = 4 * 1024 * 1024; // 4MB — QR screenshots are small

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Map a content-type to the file extension we'll use for R2 keys.
const QR_EXT_FOR = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Upload a QR screenshot to R2 / S3 under a stable, namespaced key
 * and return the public URL we'll persist on the WalletRequest.
 *
 * Throws `internal` if the bucket isn't configured or the upload
 * itself fails — caller is responsible for surfacing that to the
 * client without leaking SDK internals.
 */
async function uploadQrToR2({ buffer, contentType, userId, prefix = 'wallet-qr' }) {
  if (!S3_BUCKET) {
    throw internal('Storage bucket is not configured on this server');
  }
  const ext = QR_EXT_FOR[contentType] || 'jpg';
  // <prefix>/<userId>/<utc-yyyymmdd>-<nanoid>.<ext>
  // Date prefix keeps R2 lists scannable; nanoid avoids collisions.
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const key = `${prefix}/${userId}/${date}-${nanoid(10)}.${ext}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // QR screenshots are not cache-busted, but admins shouldn't
        // need to re-fetch often. Keep it private-cacheable.
        CacheControl: 'private, max-age=86400',
      }),
    );
  } catch (err) {
    logger.error({ err, key }, 'r2 qr upload failed');
    throw internal('Failed to store QR screenshot');
  }

  const base = (CDN_BASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    // No CDN configured — return an internal indicator so the caller
    // knows something is wrong; the admin endpoint will fall back to
    // serving raw bytes via the legacy qrData path if needed.
    throw internal('CDN base URL is not configured');
  }
  return `${base}/${key}`;
}

// Razorpay client. Lazy-init so the server can boot without keys (dev
// environments / staging without a payment gateway). Throws cleanly if
// someone hits a payment endpoint without keys configured.
let _razorpay = null;
function razorpayClient() {
  if (_razorpay) return _razorpay;
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw internal('Razorpay is not configured on this server');
  }
  _razorpay = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
  return _razorpay;
}

/**
 * User-initiated top-up request. The user has already paid via UPI by
 * scanning the platform QR; they paste the bank transaction reference
 * here. An admin matches it against the collection account before
 * flipping the request to `approved` and crediting the wallet.
 *
 * `referenceId` is the UPI reference (a.k.a. UTR / RRN). 12 digits
 * is the standard UPI RRN length, but we accept anything that looks
 * like a non-trivial alphanumeric identifier so banks with longer
 * reference formats also work.
 */
export async function createTopupRequest(
  userId,
  { amount, referenceId, payerUpiId },
  screenshotBuffer = null,
  screenshotContentType = null,
) {
  const amt = round2(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw badRequest('Amount must be greater than zero');
  }
  if (amt > 1_000_000) {
    throw badRequest('Amount looks too high — contact support');
  }
  const ref = String(referenceId || '').trim();
  if (!ref) throw badRequest('Reference / transaction id is required');
  if (ref.length < 6 || ref.length > 64) {
    throw badRequest('Reference id should be 6–64 characters');
  }
  if (!/^[A-Za-z0-9_\-]+$/.test(ref)) {
    throw badRequest('Reference id must be letters, digits, dashes or underscores only');
  }

  // Payer UPI handle ("paying from") — what the user pasted in for
  // their own UPI id. We normalise the same way as withdrawal: must
  // look like name@bank. Phone-only entries are auto-suffixed @paytm
  // via resolveVpa() so users who only know their phone aren't
  // blocked.
  const payerVpa = resolveVpa(payerUpiId);
  if (!payerVpa) {
    throw badRequest('Enter the UPI ID you paid from (e.g. yourname@paytm)');
  }

  // Block obvious replay: same user submitting the same reference id
  // twice (whether pending or already approved). The unique-by-user
  // check is loose enough that the admin can still see both rows if
  // needed (we surface a 409, not delete anything).
  const existing = await WalletRequest.findOne({ userId, type: 'topup', referenceId: ref });
  if (existing) {
    throw badRequest(
      `Reference ${ref} is already on file (status: ${existing.status})`,
    );
  }

  // Payment screenshot (optional but strongly recommended). Same
  // validation rules as the withdraw QR path: jpeg/png/webp, ≤4MB.
  // Uploads go to R2 under `wallet-topup/...` so admin moderation can
  // visually verify without round-tripping bytes through Mongo.
  let screenshotUrl = null;
  if (screenshotBuffer && screenshotBuffer.length) {
    if (screenshotBuffer.length > MAX_QR_BYTES) {
      throw badRequest('Screenshot too large (max 4MB)');
    }
    if (!ALLOWED_QR_TYPES.includes(screenshotContentType)) {
      throw badRequest('Screenshot must be a JPEG, PNG, or WebP image');
    }
    screenshotUrl = await uploadQrToR2({
      buffer: screenshotBuffer,
      contentType: screenshotContentType,
      userId: String(userId),
      prefix: 'wallet-topup',
    });
  }

  const doc = await WalletRequest.create({
    userId,
    type: 'topup',
    amount: amt,
    status: 'pending',
    referenceId: ref,
    payerUpiId: payerVpa,
    qrUrl: screenshotUrl,
    qrContentType: screenshotUrl ? screenshotContentType : null,
  });
  return {
    id: String(doc._id),
    status: doc.status,
    referenceId: ref,
    payerUpiId: payerVpa,
    qrUrl: screenshotUrl,
  };
}

// VPA validation: accepts standard UPI handle shape `name@bank`. We
// also accept all-digit "phone-style" inputs (10–13 digits) and
// auto-suffix them with the most common provider's domain — see
// resolveVpa() below — so users who only know their phone number get
// a sensible default.
const VPA_RE = /^[\w.\-]{2,}@[\w.\-]{2,}$/;

/**
 * Resolve a user-typed identifier into a real UPI VPA. If it already
 * contains '@', trust it. If it's all digits (a phone number), append
 * '@<defaultProvider>'. The default is `paytm` because Paytm assigns
 * the user's phone as their default VPA — but in practice many users
 * will need to specify their actual provider's suffix (e.g. @ybl,
 * @okhdfcbank). The form on the frontend explains this.
 */
function resolveVpa(input, defaultProvider = 'paytm') {
  const trimmed = String(input || '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) {
    return VPA_RE.test(trimmed) ? trimmed : null;
  }
  // Phone-only input — keep it loose, allow optional country code.
  const digits = trimmed.replace(/[\s+\-]/g, '');
  if (!/^\d{10,13}$/.test(digits)) return null;
  return `${digits}@${defaultProvider}`;
}

/**
 * Step 1 of the Razorpay top-up flow: create an order on Razorpay's
 * side, persist a corresponding pending WalletRequest, and return the
 * minimal payload the browser needs to launch the checkout.
 *
 * `amount` is in credits (1 credit == 1 INR for now). Razorpay wants
 * paise, so we multiply by 100 before handing it off.
 */
export async function createRazorpayOrder(userId, { amount }) {
  const amt = round2(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw badRequest('Amount must be greater than zero');
  }
  if (amt < 1) throw badRequest('Minimum top-up is 1 credit');
  if (amt > 1_000_000) throw badRequest('Amount looks too high — contact support');

  const client = razorpayClient();
  const request = await WalletRequest.create({
    userId,
    type: 'topup',
    amount: amt,
    status: 'pending',
  });

  const order = await client.orders.create({
    amount: Math.round(amt * 100), // paise
    currency: 'INR',
    // Receipt is shown in the Razorpay dashboard — link the order back
    // to our internal request so support can cross-reference.
    receipt: `topup_${String(request._id)}`,
    notes: {
      userId: String(userId),
      walletRequestId: String(request._id),
      credits: String(amt),
    },
  });

  // Persist the Razorpay orderId on the request so verify can match
  // them later. Stored in adminNote because the schema doesn't have a
  // dedicated `gatewayOrderId` field yet — and we don't want to bump
  // the schema for a single string.
  request.adminNote = `razorpay:${order.id}`;
  await request.save();

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: env.RAZORPAY_KEY_ID,
    walletRequestId: String(request._id),
  };
}

/**
 * Step 2 of the Razorpay top-up flow: verify the HMAC signature
 * Razorpay returned to the browser, then atomically credit the user's
 * wallet and mark the request approved.
 *
 * If the signature doesn't match (tampering / replay), reject loudly
 * and leave the wallet untouched.
 */
export async function verifyRazorpayPayment(
  userId,
  { walletRequestId, razorpayOrderId, razorpayPaymentId, razorpaySignature },
) {
  if (!walletRequestId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw badRequest('Missing payment fields');
  }

  if (!env.RAZORPAY_KEY_SECRET) {
    throw internal('Razorpay is not configured on this server');
  }

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  // Constant-time compare to avoid timing-side-channel guesses.
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(razorpaySignature), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    logger.warn(
      { userId, walletRequestId, razorpayOrderId },
      'razorpay signature mismatch',
    );
    throw badRequest('Payment signature mismatch');
  }

  const request = await WalletRequest.findOne({
    _id: walletRequestId,
    userId,
    type: 'topup',
  });
  if (!request) throw badRequest('Wallet request not found');
  if (request.status === 'approved') {
    // Idempotency: payment already credited — return current state.
    const user = await User.findById(userId).select('walletBalance').lean();
    return {
      ok: true,
      walletBalance: round2(user?.walletBalance || 0),
      walletRequestId: String(request._id),
      alreadyApproved: true,
    };
  }
  if (request.status === 'rejected') {
    throw badRequest('This top-up was already rejected');
  }
  // Confirm the order id stored at creation matches the one Razorpay
  // signed — defends against a malicious client submitting a verify
  // payload that points at a different request.
  if (request.adminNote && request.adminNote !== `razorpay:${razorpayOrderId}`) {
    throw badRequest('Order mismatch');
  }

  // Credit the wallet and mark the request approved in one go.
  const user = await User.findById(userId);
  if (!user) throw badRequest('User not found');
  user.walletBalance = round2((user.walletBalance || 0) + request.amount);
  await user.save();

  request.status = 'approved';
  request.actionedAt = new Date();
  request.adminNote = `razorpay:${razorpayOrderId}|paid:${razorpayPaymentId}`;
  await request.save();

  logger.info(
    {
      userId: String(userId),
      walletRequestId: String(request._id),
      amount: request.amount,
      razorpayPaymentId,
    },
    'wallet top-up via razorpay',
  );

  return {
    ok: true,
    walletBalance: user.walletBalance,
    walletRequestId: String(request._id),
  };
}

/**
 * Creator-initiated withdrawal request. Stores the UPI id and the QR
 * screenshot (raw bytes) so an admin can verify the destination before
 * paying out and debiting the creator's earnings.
 */
export async function createWithdrawRequest(
  userId,
  { amount, upiId },
  qrBuffer,
  qrContentType,
) {
  const amt = round2(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw badRequest('Amount must be greater than zero');
  }
  const upi = String(upiId || '').trim();
  if (!upi) throw badRequest('UPI id is required');
  if (upi.length > 200) throw badRequest('UPI id is too long');
  // Lightweight format check — `<handle>@<bank>`. Don't be too strict;
  // some PSP handles include digits, dots, dashes, underscores.
  if (!/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(upi)) {
    throw badRequest('UPI id should look like name@bank');
  }
  if (!qrBuffer || !qrBuffer.length) {
    throw badRequest('QR screenshot is required');
  }
  if (qrBuffer.length > MAX_QR_BYTES) {
    throw badRequest('QR image too large (max 4MB)');
  }
  if (!ALLOWED_QR_TYPES.includes(qrContentType)) {
    throw badRequest('QR must be a JPEG, PNG, or WebP image');
  }

  // Upload to R2 first; only persist the resulting URL on the
  // WalletRequest so the document stays small and the admin panel
  // can <img src> the QR directly without an authenticated fetch.
  const qrUrl = await uploadQrToR2({
    buffer: qrBuffer,
    contentType: qrContentType,
    userId: String(userId),
  });

  const doc = await WalletRequest.create({
    userId,
    type: 'withdraw',
    amount: amt,
    upiId: upi,
    qrUrl,
    qrContentType,
    status: 'pending',
  });
  return { id: String(doc._id), status: doc.status, qrUrl };
}

/**
 * List the current user's recent wallet requests so they can see what
 * they've submitted and whether each one is still pending. Cap to the
 * latest 30 — older history isn't actionable.
 */
export async function listMyRequests(userId) {
  const items = await WalletRequest.find({ userId })
    .sort({ _id: -1 })
    .limit(30)
    .select('-qrData')
    .lean();
  return {
    items: items.map((r) => ({
      id: String(r._id),
      type: r.type,
      amount: r.amount,
      // Topup-specific:
      referenceId: r.referenceId,
      payerUpiId: r.payerUpiId,
      // Withdraw-specific:
      upiId: r.upiId,
      // Both flows now write a CDN URL when a screenshot was uploaded.
      // Legacy rows might only have qrContentType (bytes were in qrData
      // before R2 migration) — frontend treats hasQr as "an image
      // exists somewhere", qrUrl as the direct link.
      qrUrl: r.qrUrl || null,
      hasQr: !!(r.qrUrl || r.qrContentType),
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      actionedAt: r.actionedAt,
    })),
  };
}

/* -----------------------------------------------------------------------
 * Admin-side wallet-request management.
 * ---------------------------------------------------------------------*/

/**
 * List wallet requests for the admin panel. `type` filters topup vs
 * withdraw; `status` filters pending / approved / rejected; both are
 * optional. Hydrates the requesting user's username + balance so the
 * admin can verify before approving.
 */
export async function adminListWalletRequests({ type, status, cursor, limit = 30 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const filter = {};
  if (type === 'topup' || type === 'withdraw') filter.type = type;
  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    filter.status = status;
  }
  if (cursor) {
    try {
      filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    } catch {
      /* ignore malformed cursor */
    }
  }

  const items = await WalletRequest.find(filter)
    .sort({ _id: -1 })
    .limit(lim + 1)
    .select('-qrData') // Image bytes only fetched on demand for admin preview.
    .lean();

  const hasMore = items.length > lim;
  const trimmed = hasMore ? items.slice(0, lim) : items;

  const userIds = [...new Set(trimmed.map((r) => String(r.userId)))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('_id username displayName email role walletBalance earningsBalance')
        .lean()
    : [];
  const userMap = new Map(
    users.map((u) => [
      String(u._id),
      {
        id: String(u._id),
        username: u.username,
        displayName: u.displayName || u.username,
        email: u.email,
        role: u.role,
        walletBalance: round2(u.walletBalance || 0),
        earningsBalance: round2(u.earningsBalance || 0),
      },
    ]),
  );

  return {
    items: trimmed.map((r) => ({
      id: String(r._id),
      type: r.type,
      amount: r.amount,
      status: r.status,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      actionedAt: r.actionedAt,
      // Topup-specific:
      referenceId: r.referenceId,
      payerUpiId: r.payerUpiId,
      // Withdraw-specific:
      upiId: r.upiId,
      qrUrl: r.qrUrl || null,
      hasQr: !!(r.qrUrl || r.qrContentType),
      // Gateway markers (only set for Razorpay flows):
      gatewayOrderId: r.gatewayOrderId,
      gatewayPaymentId: r.gatewayPaymentId,
      gatewayMethod: r.gatewayMethod,
      gatewayVpa: r.gatewayVpa,
      user: userMap.get(String(r.userId)) || null,
    })),
    nextCursor: hasMore ? String(trimmed[trimmed.length - 1]._id) : null,
  };
}

/**
 * Aggregate cash-flow totals for the admin dashboard:
 *   - in:    approved top-ups (real cash received from users)
 *   - out:   approved withdrawals (cash paid out to creators)
 *   - profit: in − out (platform's net cash position)
 *
 * Also returns pending counts per type so the admin can see how much
 * is still queued without scrolling.
 */
export async function adminWalletStats() {
  const [topupAggs, withdrawAggs] = await Promise.all([
    WalletRequest.aggregate([
      { $match: { type: 'topup' } },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    WalletRequest.aggregate([
      { $match: { type: 'withdraw' } },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const pick = (rows, status) => {
    const r = rows.find((x) => x._id === status);
    return { total: round2(r?.total || 0), count: r?.count || 0 };
  };

  const topupApproved = pick(topupAggs, 'approved');
  const topupPending = pick(topupAggs, 'pending');
  const withdrawApproved = pick(withdrawAggs, 'approved');
  const withdrawPending = pick(withdrawAggs, 'pending');

  return {
    in: topupApproved,
    out: withdrawApproved,
    profit: round2(topupApproved.total - withdrawApproved.total),
    pendingIn: topupPending,
    pendingOut: withdrawPending,
  };
}

/**
 * Approve a top-up request: credits the user's wallet by the request
 * amount and flips the request to `approved`. Idempotent.
 */
export async function adminApproveTopup(adminId, requestId, { adminNote } = {}) {
  const request = await WalletRequest.findById(requestId);
  if (!request) throw badRequest('Request not found');
  if (request.type !== 'topup') {
    throw badRequest('Not a top-up request — use approve-withdraw instead');
  }
  if (request.status === 'approved') {
    return { ok: true, alreadyApproved: true, requestId: String(request._id) };
  }
  if (request.status === 'rejected') {
    throw badRequest('This request was already rejected');
  }
  const user = await User.findById(request.userId);
  if (!user) throw badRequest('User not found');
  user.walletBalance = round2((user.walletBalance || 0) + request.amount);
  await user.save();
  request.status = 'approved';
  request.actionedBy = adminId;
  request.actionedAt = new Date();
  if (adminNote) request.adminNote = String(adminNote).slice(0, 500);
  await request.save();
  logger.info(
    {
      adminId: String(adminId),
      requestId: String(request._id),
      userId: String(user._id),
      amount: request.amount,
    },
    'admin approved topup',
  );
  return {
    ok: true,
    requestId: String(request._id),
    walletBalance: user.walletBalance,
  };
}

/**
 * Approve a withdrawal request: debits the creator's earnings by the
 * request amount and flips the request to `approved`. Caller should
 * have already paid out off-platform via the UPI handle.
 */
export async function adminApproveWithdraw(adminId, requestId, { adminNote } = {}) {
  const request = await WalletRequest.findById(requestId);
  if (!request) throw badRequest('Request not found');
  if (request.type !== 'withdraw') {
    throw badRequest('Not a withdrawal request — use approve-topup instead');
  }
  if (request.status === 'approved') {
    return { ok: true, alreadyApproved: true, requestId: String(request._id) };
  }
  if (request.status === 'rejected') {
    throw badRequest('This request was already rejected');
  }
  const user = await User.findById(request.userId);
  if (!user) throw badRequest('User not found');
  if ((user.earningsBalance || 0) < request.amount) {
    throw badRequest(
      `Earnings balance ${user.earningsBalance || 0} is below request amount ${request.amount}`,
    );
  }
  user.earningsBalance = round2((user.earningsBalance || 0) - request.amount);
  await user.save();
  request.status = 'approved';
  request.actionedBy = adminId;
  request.actionedAt = new Date();
  if (adminNote) request.adminNote = String(adminNote).slice(0, 500);
  await request.save();
  logger.info(
    {
      adminId: String(adminId),
      requestId: String(request._id),
      userId: String(user._id),
      amount: request.amount,
    },
    'admin approved withdrawal',
  );
  return {
    ok: true,
    requestId: String(request._id),
    earningsBalance: user.earningsBalance,
  };
}

/**
 * Reject either a top-up or withdrawal request. No balance changes.
 */
export async function adminRejectWalletRequest(adminId, requestId, { adminNote } = {}) {
  const request = await WalletRequest.findById(requestId);
  if (!request) throw badRequest('Request not found');
  if (request.status === 'approved') {
    throw badRequest('Already approved — cannot reject');
  }
  if (request.status === 'rejected') {
    return { ok: true, alreadyRejected: true, requestId: String(request._id) };
  }
  request.status = 'rejected';
  request.actionedBy = adminId;
  request.actionedAt = new Date();
  if (adminNote) request.adminNote = String(adminNote).slice(0, 500);
  await request.save();
  logger.info(
    { adminId: String(adminId), requestId: String(request._id) },
    'admin rejected wallet request',
  );
  return { ok: true, requestId: String(request._id) };
}

/**
 * Legacy QR fetch path. New uploads are stored on R2 with the public
 * URL on `qrUrl` — the admin panel reads that directly via <img src>.
 * This endpoint is only needed for old WalletRequests written before
 * the R2 migration, where the bytes still live in Mongo.
 *
 * `.lean()` returns Buffer-typed fields as MongoDB Binary objects (not
 * Node Buffers), so `Buffer.from(...)` normalises them. Same pattern as
 * admin.service.js::getVerificationPhoto.
 */
export async function adminGetWithdrawQr(requestId) {
  let id;
  try {
    id = new mongoose.Types.ObjectId(requestId);
  } catch {
    return null; // malformed id → 404 not 500
  }
  const r = await WalletRequest.findById(id)
    .select({ qrData: 1, qrContentType: 1, qrUrl: 1, type: 1 })
    .lean();
  if (!r || r.type !== 'withdraw') return null;
  // If the new R2 path is in use, redirect-style hand-off — caller
  // can serve a 302 instead of streaming bytes.
  if (r.qrUrl) {
    return { redirectUrl: r.qrUrl };
  }
  if (!r.qrData || !r.qrData.length) return null;
  return {
    buffer: Buffer.from(r.qrData),
    contentType: r.qrContentType || 'image/jpeg',
  };
}

/**
 * UPI Collect (server-to-server) top-up flow:
 *   - Caller supplies VPA (or a phone we'll resolve) + amount.
 *   - We create a Razorpay order, then call payments.createUpi with
 *     `flow: 'collect'` so Razorpay pushes a collect request straight
 *     to the user's UPI app — no checkout modal.
 *   - We persist the gateway ids on a pending WalletRequest so the
 *     poll endpoint can reconcile when the user approves the prompt.
 *
 * Caveat: this endpoint requires the merchant account to have S2S UPI
 * enabled. If it isn't, the createUpi call returns a clean error and
 * we surface it to the caller.
 */
export async function createUpiCollect(userId, { amount, vpa, phone }) {
  const amt = round2(amount);
  if (!Number.isFinite(amt) || amt < 1) {
    throw badRequest('Minimum top-up is 1 credit');
  }
  if (amt > 1_000_000) throw badRequest('Amount looks too high — contact support');

  const resolvedVpa = resolveVpa(vpa);
  if (!resolvedVpa) {
    throw badRequest("Enter a valid UPI ID (e.g. yourname@paytm) or a phone number");
  }
  const contact = String(phone || '').trim() || undefined;

  const client = razorpayClient();
  const user = await User.findById(userId).select('email username displayName').lean();

  const request = await WalletRequest.create({
    userId,
    type: 'topup',
    amount: amt,
    status: 'pending',
    gatewayMethod: 'upi-collect',
    gatewayVpa: resolvedVpa,
  });

  let order;
  try {
    order = await client.orders.create({
      amount: Math.round(amt * 100), // paise
      currency: 'INR',
      receipt: `topup_${String(request._id)}`,
      notes: {
        userId: String(userId),
        walletRequestId: String(request._id),
        credits: String(amt),
        vpa: resolvedVpa,
      },
    });
  } catch (err) {
    request.status = 'rejected';
    request.adminNote = `order-create-failed:${err?.error?.description || err.message}`;
    await request.save();
    throw badRequest(err?.error?.description || 'Failed to create payment order');
  }

  request.gatewayOrderId = order.id;
  await request.save();

  // S2S UPI Collect. Razorpay will push a "Pay X" notification to the
  // VPA's UPI app; user approves there. We rely on the poll endpoint
  // (or a webhook, if configured) to detect capture.
  let payment;
  try {
    payment = await client.payments.createUpi({
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      email: user?.email || 'noreply@callnade.site',
      contact: contact || '0000000000',
      method: 'upi',
      customer_id: undefined,
      ip: undefined,
      referer: undefined,
      user_agent: undefined,
      description: `Top up ${amt} credit${amt === 1 ? '' : 's'}`,
      upi: {
        flow: 'collect',
        vpa: resolvedVpa,
        expiry_time: 5, // minutes — UPI apps usually time out collects fast
      },
    });
  } catch (err) {
    request.status = 'rejected';
    request.adminNote = `upi-create-failed:${err?.error?.description || err.message}`;
    await request.save();
    const msg =
      err?.error?.description ||
      err?.message ||
      'Failed to send UPI collect request';
    logger.warn({ err, userId, vpa: resolvedVpa }, 'razorpay upi collect failed');
    throw badRequest(msg);
  }

  // payments.createUpi returns an object containing razorpay_payment_id.
  const paymentId =
    payment?.razorpay_payment_id ||
    payment?.id ||
    payment?.payment_id ||
    null;

  if (paymentId) {
    request.gatewayPaymentId = paymentId;
    await request.save();
  }

  return {
    walletRequestId: String(request._id),
    paymentId,
    orderId: order.id,
    vpa: resolvedVpa,
    amount: amt,
    status: 'pending',
    expiresInSec: 5 * 60,
  };
}

/**
 * Poll the status of a UPI-collect (or any gateway-driven) wallet
 * request. The frontend hits this every few seconds while the user
 * has the UPI app prompt open. On `captured` we credit the wallet
 * once and flip the request to approved; on `failed` / `expired` we
 * mark it rejected.
 */
export async function pollWalletRequestStatus(userId, walletRequestId) {
  const request = await WalletRequest.findOne({
    _id: walletRequestId,
    userId,
  });
  if (!request) throw badRequest('Wallet request not found');

  // Terminal states — return current snapshot, no Razorpay roundtrip.
  if (request.status === 'approved') {
    const user = await User.findById(userId).select('walletBalance').lean();
    return {
      status: 'approved',
      walletBalance: round2(user?.walletBalance || 0),
      walletRequestId: String(request._id),
    };
  }
  if (request.status === 'rejected') {
    return {
      status: 'rejected',
      reason: request.adminNote || null,
      walletRequestId: String(request._id),
    };
  }

  // Not yet terminal — ask Razorpay.
  if (!request.gatewayPaymentId) {
    return { status: 'pending', walletRequestId: String(request._id) };
  }

  const client = razorpayClient();
  let payment;
  try {
    payment = await client.payments.fetch(request.gatewayPaymentId);
  } catch (err) {
    logger.warn(
      { err, walletRequestId, paymentId: request.gatewayPaymentId },
      'razorpay payment fetch failed',
    );
    return { status: 'pending', walletRequestId: String(request._id) };
  }

  const gwStatus = payment?.status || 'created';

  if (gwStatus === 'captured' || gwStatus === 'authorized') {
    // Credit the wallet — but only once. Re-check status in case two
    // poll calls raced.
    const fresh = await WalletRequest.findById(request._id);
    if (fresh.status === 'approved') {
      const user = await User.findById(userId).select('walletBalance').lean();
      return {
        status: 'approved',
        walletBalance: round2(user?.walletBalance || 0),
        walletRequestId: String(fresh._id),
      };
    }
    const user = await User.findById(userId);
    if (!user) throw badRequest('User not found');
    user.walletBalance = round2((user.walletBalance || 0) + fresh.amount);
    await user.save();
    fresh.status = 'approved';
    fresh.actionedAt = new Date();
    fresh.adminNote = `razorpay:${request.gatewayOrderId}|paid:${request.gatewayPaymentId}`;
    await fresh.save();
    logger.info(
      {
        userId: String(userId),
        walletRequestId: String(fresh._id),
        amount: fresh.amount,
        razorpayPaymentId: request.gatewayPaymentId,
      },
      'wallet top-up via upi-collect',
    );
    return {
      status: 'approved',
      walletBalance: user.walletBalance,
      walletRequestId: String(fresh._id),
    };
  }

  if (gwStatus === 'failed') {
    request.status = 'rejected';
    request.actionedAt = new Date();
    request.adminNote = `gateway-failed:${payment?.error_description || 'unknown'}`;
    await request.save();
    return {
      status: 'rejected',
      reason: payment?.error_description || 'Payment failed',
      walletRequestId: String(request._id),
    };
  }

  // 'created' or anything else → still waiting.
  return {
    status: 'pending',
    walletRequestId: String(request._id),
    gatewayStatus: gwStatus,
  };
}
