import mongoose from 'mongoose';

/**
 * Platform-wide key/value store for small singleton config that the
 * admin can flip at runtime without a code deploy.
 *
 * Current keys:
 *   - `razorpay_enabled` → boolean. When `false`, the frontend
 *     suppresses the Razorpay tab on the Add-credits modal and
 *     defaults users to the manual QR + reference flow.
 *
 * Values are `Mixed` so future keys can carry any JSON-serialisable
 * shape (object, number, etc.) without a schema migration.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const Setting = mongoose.model('Setting', settingSchema);

export async function getSetting(key, fallback = null) {
  const row = await Setting.findOne({ key }).lean();
  return row?.value ?? fallback;
}

export async function setSetting(key, value) {
  await Setting.updateOne(
    { key },
    { $set: { value } },
    { upsert: true },
  );
  return value;
}
