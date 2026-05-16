import { Media } from '../models/media.model.js';
import { User } from '../models/user.model.js';
import { Follow } from '../models/follow.model.js';
import { imageQueue } from '../queues/queues.js';
import { badRequest, forbidden, notFound } from '../utils/HttpError.js';
import { variantUrl } from '../utils/signedUrl.js';

async function isAdminUser(userId) {
  if (!userId) return false;
  const u = await User.findById(userId).select('role isAdmin').lean();
  return !!u && (u.role === 'admin' || u.isAdmin === true);
}

const MAX_GALLERY = 9;
const PUBLIC_SLOTS = 3;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB original; variants are tiny

/**
 * Direct upload — frontend sends raw image bytes as the request body.
 * We persist the buffer in Mongo and enqueue a worker job to generate
 * thumb/full/blurred variants (also stored in Mongo).
 */
export async function uploadDirect(userId, { kind, position, contentType }, buffer) {
  if (!buffer?.length) throw badRequest('Empty body');
  if (buffer.length > MAX_UPLOAD_BYTES) throw badRequest('File too large (max 8MB)');
  if (!ALLOWED_TYPES.includes(contentType)) throw badRequest('Unsupported content type');
  if (!['avatar', 'gallery', 'verification'].includes(kind)) {
    throw badRequest('Unsupported kind');
  }

  if (kind === 'gallery') {
    const pos = Number(position);
    if (!Number.isInteger(pos) || pos < 0 || pos >= MAX_GALLERY) {
      throw badRequest('Position must be 0..8');
    }
    position = pos;
  }

  // Verification photos are always private; only the owner + admins can
  // resolve them via the /signed flow.
  let visibility;
  if (kind === 'avatar') visibility = 'public';
  else if (kind === 'verification') visibility = 'locked';
  else visibility = position < PUBLIC_SLOTS ? 'public' : 'locked';

  const media = await Media.create({
    userId,
    type: kind,
    position: kind === 'gallery' ? position : 0,
    visibility,
    contentType,
    bytes: buffer.length,
    originalData: buffer,
    status: 'processing',
  });

  // Replace any previous occupant at that gallery slot / previous avatar /
  // previous verification photo.
  if (kind === 'gallery') {
    await Media.deleteMany({
      userId,
      type: 'gallery',
      position,
      _id: { $ne: media._id },
    });
  } else if (kind === 'avatar') {
    await User.updateOne({ _id: userId }, { avatarMediaId: media._id });
    await Media.deleteMany({ userId, type: 'avatar', _id: { $ne: media._id } });
  } else if (kind === 'verification') {
    await User.updateOne(
      { _id: userId },
      { verificationMediaId: media._id, verifiedAt: new Date() },
    );
    await Media.deleteMany({ userId, type: 'verification', _id: { $ne: media._id } });
  }

  await imageQueue.add('process', { mediaId: String(media._id) }, { jobId: String(media._id) });

  return { mediaId: media._id, status: media.status };
}

export async function deleteMedia(userId, mediaId) {
  const media = await Media.findOneAndDelete({ _id: mediaId, userId });
  if (!media) throw notFound('Media not found');
  if (media.type === 'avatar') {
    await User.updateOne({ _id: userId }, { avatarMediaId: null });
  }
  return { ok: true };
}

/**
 * Returns the URL to a "full" variant of an image — replaces the old
 * presigned-S3 flow. We just hand back the same /raw URL that <img> tags use,
 * after enforcing access (locked images require a follow).
 */
export async function getSignedFullUrl(viewerId, mediaId) {
  const media = await Media.findById(mediaId).lean();
  if (!media || media.status !== 'ready') throw notFound('Media not available');
  if (!(await canViewFull(viewerId, media))) throw forbidden('Locked');
  const url = variantUrl(media, 'full');
  if (!url) throw notFound('Media not available');
  return { url };
}

/**
 * Streams a variant's bytes for the given media. Returns one of:
 *   - { buffer, contentType } — the raw bytes
 *   - null                    — not found (endpoint maps to 404)
 *   - 'forbidden'             — access denied (endpoint maps to 403)
 *
 * Access control:
 *   - type === 'verification' is private: ONLY the owner OR an admin can
 *     fetch. Stored privately because it's a personal ID-like asset.
 *   - All other types use URL-as-capability (anyone with the URL can fetch
 *     the bytes — same model R2's public bucket used). presentMedia() is
 *     responsible for not handing locked URLs to viewers who shouldn't
 *     see them, so <img>/<iframe> tags work without auth headers.
 */
export async function getVariantBuffer(viewerId, mediaId, variant) {
  if (!['thumb', 'full', 'blurred', 'original'].includes(variant)) return null;
  // First fetch lightweight metadata to decide access.
  const meta = await Media.findById(mediaId).select({ type: 1, userId: 1, status: 1 }).lean();
  if (!meta) return null;
  if (meta.type === 'verification') {
    const isOwner = viewerId && String(viewerId) === String(meta.userId);
    // Admin override — lazily looked up only when the requester isn't the
    // owner, so non-verification fetches stay zero-extra-DB-queries.
    if (!isOwner && !(await isAdminUser(viewerId))) return 'forbidden';
  }

  const projection = { contentType: 1, status: 1 };
  const fieldName = `${variant}Data`;
  projection[fieldName] = 1;
  const media = await Media.findById(mediaId).select(projection).lean();
  if (!media) return null;
  if (media.status !== 'ready' && variant !== 'original') return null;

  const buf = media[fieldName];
  if (!buf) return null;
  // Variants are always JPEG; original keeps its uploaded mime.
  const mime = variant === 'original' ? media.contentType || 'application/octet-stream' : 'image/jpeg';
  return { buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer || buf), contentType: mime };
}

async function canViewFull(viewerId, media) {
  if (!viewerId) return media.visibility === 'public';
  if (String(viewerId) === String(media.userId)) return true;
  if (media.visibility === 'public') return true;
  if (await Follow.exists({ follower: viewerId, followee: media.userId })) return true;
  // Admin override — admins can open locked / private images of any
  // user. Same DB hit as isAdminUser used by the verification path,
  // only fires after the cheaper checks fail.
  return !!(await isAdminUser(viewerId));
}

export function presentMedia(media, { canViewLocked }) {
  if (!media) return null;
  const isLocked = media.visibility === 'locked' && !canViewLocked;
  return {
    id: media._id,
    type: media.type,
    position: media.position,
    visibility: media.visibility,
    status: media.status,
    locked: isLocked,
    width: media.width,
    height: media.height,
    urls: {
      thumb: isLocked ? null : variantUrl(media, 'thumb'),
      full: isLocked ? null : variantUrl(media, 'full'),
      blurred: variantUrl(media, 'blurred'),
    },
  };
}
