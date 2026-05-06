import { api } from './api.js';

export async function uploadGalleryImage(file, position) {
  return uploadInternal(file, { kind: 'gallery', position });
}

export async function uploadAvatar(file) {
  return uploadInternal(file, { kind: 'avatar' });
}

// Live-camera selfie captured at signup. Stored privately for verification.
export async function uploadVerification(file) {
  return uploadInternal(file, { kind: 'verification' });
}

async function uploadInternal(file, { kind, position }) {
  // Send the raw bytes directly to our backend; it stores them in Mongo
  // and enqueues a job to generate thumb/full/blurred variants.
  const params = new URLSearchParams({ kind });
  if (position != null) params.set('position', String(position));
  const { data } = await api.post(`/media/upload?${params.toString()}`, file, {
    headers: { 'Content-Type': file.type },
    transformRequest: [(d) => d], // axios: don't try to JSON-stringify the Blob
    timeout: 120_000, // 2 min — bigger than the global 15s for slow uploads
  });
  return data.mediaId;
}
