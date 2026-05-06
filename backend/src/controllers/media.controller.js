import * as mediaService from '../services/media.service.js';
import { badRequest } from '../utils/HttpError.js';

export async function upload(req, res) {
  const { kind, position } = req.query;
  const contentType = req.headers['content-type'];
  if (!Buffer.isBuffer(req.body)) throw badRequest('Body must be raw image bytes');
  const result = await mediaService.uploadDirect(
    req.user.id,
    { kind, position, contentType },
    req.body,
  );
  res.json(result);
}

export async function raw(req, res) {
  const { variant = 'thumb' } = req.query;
  const out = await mediaService.getVariantBuffer(
    req.user?.id,
    req.params.id,
    variant,
  );
  if (out === 'forbidden') return res.status(403).end();
  if (!out) return res.status(404).end();
  res.setHeader('Content-Type', out.contentType);
  // Don't aggressively cache verification photos at intermediaries.
  res.setHeader(
    'Cache-Control',
    out.contentType?.startsWith('image/') ? 'private, max-age=86400' : 'private, no-cache',
  );
  res.setHeader('Content-Length', out.buffer.length);
  res.end(out.buffer);
}

export async function remove(req, res) {
  res.json(await mediaService.deleteMedia(req.user.id, req.params.id));
}

export async function signed(req, res) {
  res.json(await mediaService.getSignedFullUrl(req.user?.id, req.params.id));
}
