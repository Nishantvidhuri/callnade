import { User } from '../models/user.model.js';
import { Media } from '../models/media.model.js';
import { redis } from '../config/redis.js';
import { avatarThumb } from '../utils/signedUrl.js';
import { badRequest, notFound } from '../utils/HttpError.js';
import { getActiveCalls } from '../realtime/handlers/call.handlers.js';

export async function listAllUsers({ cursor, limit = 30, q, sort = 'newest' } = {}) {
  // sort: 'newest' (default — newest signups first) | 'oldest'.
  // Cursor pagination is on _id which monotonically increases with
  // creation time, so the sort direction also dictates the cursor
  // comparator below.
  const order = sort === 'oldest' ? 1 : -1;

  const filter = {};
  if (q && q.trim()) {
    const re = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ username: re }, { displayName: re }, { email: re }];
  }
  if (cursor) {
    // Newest-first paginates with _id < cursor; oldest-first with _id > cursor.
    filter._id = order === -1 ? { $lt: cursor } : { $gt: cursor };
  }

  const users = await User.find(filter)
    .sort({ _id: order })
    .limit(limit + 1)
    .select('_id email username displayName avatarMediaId followerCount followingCount isAdmin role banned bannedAt deletedAt walletBalance earningsBalance createdAt lastSeenAt')
    .lean();

  const hasMore = users.length > limit;
  const trimmed = hasMore ? users.slice(0, limit) : users;

  const avatarIds = trimmed.map((u) => u.avatarMediaId).filter(Boolean);
  const avatars = avatarIds.length
    ? await Media.find({ _id: { $in: avatarIds } }).select('_id variants').lean()
    : [];
  const avatarMap = new Map(avatars.map((a) => [String(a._id), a]));

  const ids = trimmed.map((u) => String(u._id));
  const presenceVals = ids.length
    ? await redis.mget(...ids.map((id) => `presence:${id}`))
    : [];
  const onlineSet = new Set();
  presenceVals.forEach((v, i) => v && onlineSet.add(ids[i]));

  return {
    items: trimmed.map((u) => ({
      id: String(u._id),
      email: u.email,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarMediaId
        ? avatarThumb(avatarMap.get(String(u.avatarMediaId)))
        : null,
      followerCount: u.followerCount || 0,
      followingCount: u.followingCount || 0,
      role: u.role || (u.isAdmin ? 'admin' : 'user'),
      isAdmin: !!u.isAdmin || u.role === 'admin',
      banned: !!u.banned,
      bannedAt: u.bannedAt,
      deletedAt: u.deletedAt || null,
      walletBalance: u.walletBalance || 0,
      earningsBalance: u.earningsBalance || 0,
      online: onlineSet.has(String(u._id)),
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
    })),
    nextCursor: hasMore ? trimmed[trimmed.length - 1]._id : null,
  };
}

// Keep balances clean — every write rounds to 2 decimals so floating-point
// drift from per-minute billing can never end up persisted.
const round2 = (n) => Math.round((n || 0) * 100) / 100;

export async function adjustWallet(adminId, targetId, delta) {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) {
    throw badRequest('Delta must be a non-zero number');
  }
  const target = await User.findById(targetId);
  if (!target) throw notFound('User not found');
  const current = target.walletBalance || 0;
  const next = round2(Math.max(0, current + delta));
  target.walletBalance = next;
  await target.save();
  return { ok: true, userId: targetId, walletBalance: next, delta: round2(next - current) };
}

export async function adjustEarnings(adminId, targetId, delta) {
  if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) {
    throw badRequest('Delta must be a non-zero number');
  }
  const target = await User.findById(targetId);
  if (!target) throw notFound('User not found');
  const current = target.earningsBalance || 0;
  const next = round2(Math.max(0, current + delta));
  target.earningsBalance = next;
  await target.save();
  return { ok: true, userId: targetId, earningsBalance: next, delta: round2(next - current) };
}

/**
 * Soft-delete: mark the account as deleted so it disappears from every
 * public listing and can no longer log in. Data is retained — admins can
 * restore the account or audit the consent record.
 */
export async function softDeleteUser(adminId, targetId) {
  if (String(adminId) === String(targetId)) throw badRequest('You cannot delete yourself');
  const target = await User.findById(targetId);
  if (!target) throw notFound('User not found');
  if (target.isAdmin) throw badRequest('Cannot delete another admin');
  target.deletedAt = new Date();
  // Bump refresh-token version so any active sessions are invalidated.
  target.refreshTokenVersion = (target.refreshTokenVersion || 0) + 1;
  await target.save();
  // Bust caches that may still reference the deleted user.
  try {
    await Promise.all([
      redis.del(`profile:${target.username}`),
      redis.del('popular:providers:v2'),
    ]);
  } catch { /* ignore */ }
  return { ok: true, userId: targetId, deletedAt: target.deletedAt };
}

export async function restoreUser(adminId, targetId) {
  const target = await User.findById(targetId);
  if (!target) throw notFound('User not found');
  if (!target.deletedAt) return { ok: true, userId: targetId, deletedAt: null };
  target.deletedAt = null;
  await target.save();
  try {
    await Promise.all([
      redis.del(`profile:${target.username}`),
      redis.del('popular:providers:v2'),
    ]);
  } catch { /* ignore */ }
  return { ok: true, userId: targetId, deletedAt: null };
}

export async function setRole(adminId, targetId, role) {
  if (!['user', 'provider', 'admin'].includes(role)) throw badRequest('Invalid role');
  if (String(adminId) === String(targetId) && role !== 'admin') {
    throw badRequest('You cannot demote yourself');
  }
  const target = await User.findById(targetId);
  if (!target) throw notFound('User not found');
  target.role = role;
  if (role === 'admin') target.isAdmin = true;
  if (role !== 'admin') target.isAdmin = false;
  await target.save();
  return { ok: true, userId: targetId, role };
}

export async function banUser(adminId, targetId) {
  if (String(adminId) === String(targetId)) throw badRequest('You cannot ban yourself');
  const target = await User.findById(targetId);
  if (!target) throw notFound('User not found');
  if (target.isAdmin) throw badRequest('Cannot ban another admin');
  target.banned = true;
  target.bannedAt = new Date();
  target.refreshTokenVersion = (target.refreshTokenVersion || 0) + 1;
  await target.save();
  await redis.del(`profile:${target.username}`).catch(() => {});
  return { ok: true, userId: targetId };
}

export async function unbanUser(targetId) {
  const target = await User.findById(targetId);
  if (!target) throw notFound('User not found');
  target.banned = false;
  target.bannedAt = null;
  await target.save();
  await redis.del(`profile:${target.username}`).catch(() => {});
  return { ok: true, userId: targetId };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listActiveCalls() {
  const calls = getActiveCalls();
  if (!calls.length) return { items: [] };

  const userIds = new Set();
  calls.forEach((c) => {
    userIds.add(String(c.callerId));
    userIds.add(String(c.calleeId));
  });

  const users = await User.find({ _id: { $in: Array.from(userIds) } })
    .select('_id username displayName avatarMediaId')
    .lean();

  const avatarIds = users.map((u) => u.avatarMediaId).filter(Boolean);
  const avatars = avatarIds.length
    ? await Media.find({ _id: { $in: avatarIds } }).select('_id variants').lean()
    : [];
  const avatarMap = new Map(avatars.map((a) => [String(a._id), a]));

  const userMap = new Map(
    users.map((u) => [
      String(u._id),
      {
        id: String(u._id),
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarMediaId
          ? avatarThumb(avatarMap.get(String(u.avatarMediaId)))
          : null,
      },
    ]),
  );

  return {
    items: calls.map((c) => ({
      callId: c.callId,
      caller: userMap.get(String(c.callerId)) || null,
      callee: userMap.get(String(c.calleeId)) || null,
      startedAt: c.startedAt,
      connectedAt: c.connectedAt,
      state: c.state,
    })),
  };
}

/**
 * Returns the full audit-relevant detail for one user — admin-only.
 * Includes consent metadata, verification photo flag, and direct URLs the
 * frontend can fetch with auth.
 */
export async function getUserDetails(userId) {
  const u = await User.findById(userId)
    // Select the whole consent subdoc — selecting individual subpaths fails
    // to materialize the parent on .lean() when every path is null, leaving
    // u.consent === undefined for legacy/seeded accounts.
    .select(
      'email username displayName bio role isAdmin banned bannedAt deletedAt walletBalance earningsBalance dateOfBirth verificationMediaId verifiedAt avatarMediaId createdAt lastSeenAt consent',
    )
    .lean();
  if (!u) throw notFound('User not found');

  const avatarMedia = u.avatarMediaId
    ? await Media.findById(u.avatarMediaId).select('_id variants').lean()
    : null;

  return {
    id: String(u._id),
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    role: u.role || (u.isAdmin ? 'admin' : 'user'),
    isAdmin: !!u.isAdmin,
    banned: !!u.banned,
    bannedAt: u.bannedAt,
    deletedAt: u.deletedAt || null,
    walletBalance: u.walletBalance || 0,
    earningsBalance: u.earningsBalance || 0,
    dateOfBirth: u.dateOfBirth,
    createdAt: u.createdAt,
    lastSeenAt: u.lastSeenAt,
    avatarUrl: avatarThumb(avatarMedia),
    verifiedAt: u.verifiedAt || null,
    hasVerificationPhoto: !!u.verificationMediaId,
    verificationMediaId: u.verificationMediaId ? String(u.verificationMediaId) : null,
    // Use the standard media-raw endpoint — the access check there allows
    // the owner OR an admin to fetch verification photos. Keeps URL patterns
    // consistent across the app (admin XHR sends Authorization → allowed).
    verificationUrl: u.verificationMediaId
      ? `/api/v1/media/${u.verificationMediaId}/raw?variant=full`
      : null,
    // Always return the consent shape so the admin UI can render the panel
    // (with empty fields and a clear "no record" hint) for legacy accounts.
    consent: {
      fullName: u.consent?.fullName || null,
      signature: u.consent?.signature || null,
      acceptedAt: u.consent?.acceptedAt || null,
      version: u.consent?.version || null,
      ip: u.consent?.ip || null,
      hasPdf: !!u.consent?.pdfBytes,
      pdfBytes: u.consent?.pdfBytes || 0,
      pdfUrl: u.consent?.pdfBytes
        ? `/api/v1/admin/users/${u._id}/consent.pdf`
        : null,
    },
  };
}

/**
 * Streams the original verification image bytes for the given user.
 * Returns null if the user has no verification photo or the buffers are
 * empty (e.g. worker hasn't processed the upload yet AND the original got
 * lost — extremely unlikely but the null-return surfaces it).
 */
export async function getVerificationPhoto(userId) {
  const u = await User.findById(userId).select('verificationMediaId').lean();
  if (!u?.verificationMediaId) return null;
  // Object-form select avoids parser ambiguity when mixing +select:false
  // fields with regular includes. Pull both buffer variants explicitly.
  const m = await Media.findById(u.verificationMediaId)
    .select({ fullData: 1, originalData: 1, contentType: 1, variants: 1 })
    .lean();
  if (!m) return null;
  // Prefer the processed full variant; fall back to the original upload.
  if (m.fullData && m.fullData.length > 0) {
    return { buffer: Buffer.from(m.fullData), contentType: 'image/jpeg' };
  }
  if (m.originalData && m.originalData.length > 0) {
    return {
      buffer: Buffer.from(m.originalData),
      contentType: m.contentType || 'image/jpeg',
    };
  }
  return null;
}

/**
 * Streams the consent PDF bytes for the given user.
 */
export async function getConsentPdf(userId) {
  const u = await User.findById(userId).select('+consent.pdfData consent.pdfBytes').lean();
  if (!u?.consent?.pdfData?.length) return null;
  return { buffer: Buffer.from(u.consent.pdfData) };
}
