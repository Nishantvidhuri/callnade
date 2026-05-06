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

export async function listVisits({ cursor, limit = 50 } = {}) {
  const filter = {};
  if (cursor) filter._id = { $lt: cursor };
  const items = await Visit.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
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
