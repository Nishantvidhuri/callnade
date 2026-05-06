// Image bytes uploaded by users live in MongoDB (the Media doc's
// <variant>Data buffer field). We serve them via /api/v1/media/:id/raw.
// Seed/demo data may instead store an external https URL directly on the
// variant — both shapes are supported here.

export function mediaUrl(mediaId, variant = 'thumb') {
  if (!mediaId) return null;
  return `/api/v1/media/${mediaId}/raw?variant=${variant}`;
}

function resolveVariant(mediaDoc, variant) {
  const v = mediaDoc?.variants?.[variant];
  if (!v) return null;
  if (typeof v === 'string') return /^https?:\/\//i.test(v) ? v : null;
  if (v === true) return mediaUrl(mediaDoc._id, variant);
  return null;
}

export function avatarThumb(mediaDoc) {
  if (!mediaDoc) return null;
  return resolveVariant(mediaDoc, 'thumb');
}

export function variantUrl(mediaDoc, variant) {
  return resolveVariant(mediaDoc, variant);
}
