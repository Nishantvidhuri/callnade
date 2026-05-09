import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import mongoose from 'mongoose';
import { PaymentQr } from '../models/paymentQr.model.js';
import { s3, S3_BUCKET, CDN_BASE_URL } from '../config/s3.js';
import { logger } from '../config/logger.js';
import { badRequest, internal, notFound } from '../utils/HttpError.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024; // 4MB
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Upload a payment QR to R2 and persist a row. Mirrors the same
 * R2 key shape as withdraw QRs (date-prefixed, nanoid-suffixed) but
 * lives under `payment-qrs/` so the buckets stay scannable.
 */
export async function uploadPaymentQr({ buffer, contentType, label, upiId, uploadedBy }) {
  if (!buffer || !buffer.length) throw badRequest('Image required');
  if (buffer.length > MAX_BYTES) throw badRequest('Image too large (max 4MB)');
  if (!ALLOWED.includes(contentType)) {
    throw badRequest('Image must be JPEG, PNG, or WebP');
  }
  if (!S3_BUCKET) throw internal('Storage bucket is not configured');

  const ext = EXT[contentType] || 'jpg';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const key = `payment-qrs/${date}-${nanoid(10)}.${ext}`;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Public-readable cache. Browsers cache aggressively since
        // the URL itself is unique per upload.
        CacheControl: 'public, max-age=86400',
      }),
    );
  } catch (err) {
    logger.error({ err, key }, 'r2 payment-qr upload failed');
    throw internal('Failed to store payment QR');
  }

  const base = (CDN_BASE_URL || '').replace(/\/+$/, '');
  if (!base) throw internal('CDN base URL is not configured');
  const url = `${base}/${key}`;

  // Loose UPI shape: standard `name@bank` style or a phone-style
  // input. Empty / whitespace stays null so the topup page just
  // hides the UPI line for that QR.
  let upi = null;
  if (upiId) {
    const trimmed = String(upiId).trim().slice(0, 120);
    if (trimmed.length >= 2) upi = trimmed;
  }

  const doc = await PaymentQr.create({
    url,
    contentType,
    label: label ? String(label).slice(0, 80) : null,
    upiId: upi,
    uploadedBy: uploadedBy || null,
  });
  return present(doc);
}

/** Admin list — every QR (active + inactive), newest first. */
export async function listPaymentQrs() {
  const items = await PaymentQr.find({})
    .sort({ _id: -1 })
    .limit(200)
    .lean();
  return { items: items.map(present) };
}

/** Public read — pick one ACTIVE QR at random. Returns `null` when
 *  the pool is empty so the frontend can fall back to a hardcoded
 *  default if needed. */
export async function pickRandomActiveQr() {
  // Mongo `$sample` reads a random subset cheaply without scanning
  // the full collection. Limit to active rows first.
  const docs = await PaymentQr.aggregate([
    { $match: { active: true } },
    { $sample: { size: 1 } },
  ]);
  return docs.length ? present(docs[0]) : null;
}

export async function setActive(id, active) {
  let _id;
  try {
    _id = new mongoose.Types.ObjectId(id);
  } catch {
    throw badRequest('Invalid id');
  }
  const doc = await PaymentQr.findByIdAndUpdate(
    _id,
    { active: !!active },
    { new: true },
  );
  if (!doc) throw notFound('Payment QR not found');
  return present(doc);
}

export async function deletePaymentQr(id) {
  let _id;
  try {
    _id = new mongoose.Types.ObjectId(id);
  } catch {
    throw badRequest('Invalid id');
  }
  const doc = await PaymentQr.findById(_id).lean();
  if (!doc) throw notFound('Payment QR not found');

  // Best-effort delete the R2 object too. The DB row is the source
  // of truth — if the R2 delete fails we still drop the row so the
  // pool stays clean.
  try {
    const base = (CDN_BASE_URL || '').replace(/\/+$/, '');
    if (S3_BUCKET && base && doc.url.startsWith(base + '/')) {
      const key = doc.url.slice(base.length + 1);
      await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    }
  } catch (err) {
    logger.warn({ err, id }, 'r2 payment-qr delete failed (row dropped anyway)');
  }
  await PaymentQr.deleteOne({ _id });
  return { ok: true };
}

function present(doc) {
  return {
    id: String(doc._id),
    url: doc.url,
    label: doc.label,
    upiId: doc.upiId || null,
    active: !!doc.active,
    contentType: doc.contentType,
    createdAt: doc.createdAt,
  };
}
