import mongoose from 'mongoose';
import { Visit } from '../models/visit.model.js';
import { User } from '../models/user.model.js';

/**
 * Best-effort User-Agent parser. Doesn't try to handle every esoteric
 * browser — we just want a clean "iPhone iOS Safari" / "Android Chrome"
 * style readout for the admin table.
 */
export function parseUA(ua) {
  const u = ua || '';

  // OS + version
  let os = 'Unknown';
  let osVersion = null;
  if (/iPad|iPhone|iPod/.test(u)) {
    os = 'iOS';
    const m = u.match(/OS (\d+[_.]\d+(?:[_.]\d+)?)/);
    if (m) osVersion = m[1].replace(/_/g, '.');
  } else if (/Android/.test(u)) {
    os = 'Android';
    const m = u.match(/Android (\d+(?:\.\d+)*)/);
    if (m) osVersion = m[1];
  } else if (/Windows NT/.test(u)) {
    os = 'Windows';
    const m = u.match(/Windows NT (\d+\.\d+)/);
    if (m) osVersion = m[1];
  } else if (/Mac OS X/.test(u)) {
    os = 'macOS';
    const m = u.match(/Mac OS X (\d+[_.]\d+(?:[_.]\d+)?)/);
    if (m) osVersion = m[1].replace(/_/g, '.');
  } else if (/Linux/.test(u)) {
    os = 'Linux';
  }

  // Browser + version (order matters — Edge/Opera both impersonate Chrome)
  let browser = 'Unknown';
  let browserVersion = null;
  const pick = (re, name) => {
    const m = u.match(re);
    if (m) {
      browser = name;
      browserVersion = m[1];
    }
  };
  if (/Edg\//.test(u)) pick(/Edg\/([\d.]+)/, 'Edge');
  else if (/OPR\//.test(u)) pick(/OPR\/([\d.]+)/, 'Opera');
  else if (/Firefox\//.test(u)) pick(/Firefox\/([\d.]+)/, 'Firefox');
  else if (/Chrome\//.test(u)) pick(/Chrome\/([\d.]+)/, 'Chrome');
  else if (/Safari\//.test(u)) pick(/Version\/([\d.]+).*Safari/, 'Safari');

  // Device type
  let deviceType = 'desktop';
  if (/iPad|Tablet/.test(u)) deviceType = 'tablet';
  else if (/Mobile|Android|iPhone|iPod/.test(u)) deviceType = 'phone';
  if (os === 'Unknown' && browser === 'Unknown') deviceType = 'unknown';

  return { os, osVersion, browser, browserVersion, deviceType };
}

/**
 * Log a single visit. Ignores quietly if anything looks malformed — this
 * shouldn't ever block a user from loading the app.
 */
export async function logVisit({ userId, ip, userAgent, language, timezone, screen, viewport, dpr, referrer, path }) {
  try {
    let username = null;
    if (userId) {
      const u = await User.findById(userId).select('username').lean();
      username = u?.username || null;
    }
    const parsed = parseUA(userAgent);
    await Visit.create({
      userId: userId || null,
      username,
      ip: ip || null,
      userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
      ...parsed,
      language: language ? String(language).slice(0, 32) : null,
      timezone: timezone ? String(timezone).slice(0, 64) : null,
      screen: screen ? String(screen).slice(0, 32) : null,
      viewport: viewport ? String(viewport).slice(0, 32) : null,
      dpr: typeof dpr === 'number' ? dpr : null,
      referrer: referrer ? String(referrer).slice(0, 500) : null,
      path: path ? String(path).slice(0, 200) : null,
    });
  } catch {
    /* swallow — logging shouldn't ever fail user flows */
  }
}

/**
 * Visit log for the admin panel. Two server-side rules baked in:
 *   1. Admin users (role: 'admin' OR legacy isAdmin: true) are excluded
 *      entirely — admins moderating the site shouldn't pollute their
 *      own analytics view.
 *   2. Each user appears at most once (collapsed to their most recent
 *      visit). For signed-in users the dedup key is `userId`; for
 *      anonymous traffic we fall back to `ip|userAgent` since there's
 *      nothing else to identify the same visitor by.
 *
 * Pagination: the dedup happens BEFORE the cursor cut, so cursor values
 * are the `_id` of the latest-per-user row. That way successive pages
 * keep the "one row per user" guarantee.
 */
export async function listVisits({ cursor, limit = 50 } = {}) {
  // Pre-fetch admin user IDs so the aggregation can $nin them out.
  const adminIds = await User.find({
    $or: [{ role: 'admin' }, { isAdmin: true }],
  }).distinct('_id');

  const pipeline = [
    { $match: { userId: { $nin: adminIds } } },
    // Newest first so $first picks the most recent visit per group.
    { $sort: { _id: -1 } },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ['$userId', null] },
            // Anonymous: dedup by IP + UA. Falls back to the visit's own
            // _id if both are missing so we don't collapse all "unknown"
            // rows into one.
            {
              $concat: [
                'anon|',
                { $ifNull: ['$ip', '?'] },
                '|',
                { $ifNull: ['$userAgent', '?'] },
              ],
            },
            // Signed-in: dedup by userId.
            { $concat: ['user|', { $toString: '$userId' }] },
          ],
        },
        latest: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$latest' } },
    // Re-sort after the group so cursor pagination works on the
    // deduped stream rather than the raw collection.
    { $sort: { _id: -1 } },
  ];

  if (cursor) {
    // Mongoose accepts string ObjectIds in $lt comparisons inside
    // aggregation, but only after a cast. Safest to import + use
    // mongoose.Types.ObjectId.
    pipeline.push({ $match: { _id: { $lt: new mongoose.Types.ObjectId(cursor) } } });
  }
  pipeline.push({ $limit: limit + 1 });

  const items = await Visit.aggregate(pipeline);
  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;

  return {
    items: trimmed.map((v) => ({
      id: String(v._id),
      userId: v.userId ? String(v.userId) : null,
      username: v.username,
      ip: v.ip,
      userAgent: v.userAgent,
      deviceType: v.deviceType,
      os: v.os,
      osVersion: v.osVersion,
      browser: v.browser,
      browserVersion: v.browserVersion,
      language: v.language,
      timezone: v.timezone,
      screen: v.screen,
      viewport: v.viewport,
      dpr: v.dpr,
      referrer: v.referrer,
      path: v.path,
      createdAt: v.createdAt,
    })),
    nextCursor: hasMore ? String(trimmed[trimmed.length - 1]._id) : null,
  };
}
