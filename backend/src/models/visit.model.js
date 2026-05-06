import mongoose from 'mongoose';

// One row per browser session — the frontend dedupes locally via
// sessionStorage so we don't get a row per page navigation. Stored fields
// are intentionally minimal (no PII beyond IP and self-reported browser
// strings) for moderation visibility.
const visitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    username: { type: String, default: null },
    ip: { type: String, default: null, index: true },
    userAgent: { type: String, default: null },
    // Parsed UA fields for fast filtering/display.
    deviceType: { type: String, default: 'unknown' }, // phone | tablet | desktop | unknown
    os: { type: String, default: 'Unknown' },
    osVersion: { type: String, default: null },
    browser: { type: String, default: 'Unknown' },
    browserVersion: { type: String, default: null },
    // Self-reported environment.
    language: { type: String, default: null },
    timezone: { type: String, default: null },
    screen: { type: String, default: null },   // "390x844"
    viewport: { type: String, default: null }, // "390x800"
    dpr: { type: Number, default: null },
    referrer: { type: String, default: null },
    path: { type: String, default: null },     // first page they hit
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

visitSchema.index({ createdAt: -1 });

export const Visit = mongoose.model('Visit', visitSchema);
