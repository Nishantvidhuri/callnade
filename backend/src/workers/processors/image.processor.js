import sharp from 'sharp';
import { Media } from '../../models/media.model.js';
import { logger } from '../../config/logger.js';

const VARIANTS = [
  { name: 'thumb', size: 256, q: 80 },
  { name: 'full', size: 1080, q: 85 },
];
const BLUR = { name: 'blurred', size: 32, q: 60, blur: 20 };

export async function processImage(job) {
  const { mediaId } = job.data;
  // Pull the Media doc *with* the original buffer.
  const media = await Media.findById(mediaId).select('+originalData');
  if (!media) throw new Error(`media ${mediaId} not found`);
  if (!media.originalData?.length) throw new Error(`media ${mediaId} has no originalData`);

  media.status = 'processing';
  await media.save();

  try {
    const original = Buffer.isBuffer(media.originalData)
      ? media.originalData
      : Buffer.from(media.originalData);
    const meta = await sharp(original).metadata();

    const variants = { thumb: false, full: false, blurred: false };
    const buffers = {};

    for (const v of VARIANTS) {
      buffers[v.name] = await sharp(original)
        .rotate()
        .resize({ width: v.size, height: v.size, fit: 'cover' })
        .jpeg({ quality: v.q })
        .toBuffer();
      variants[v.name] = true;
    }

    if (media.visibility === 'locked') {
      buffers.blurred = await sharp(original)
        .rotate()
        .resize({ width: BLUR.size })
        .blur(BLUR.blur)
        .jpeg({ quality: BLUR.q })
        .toBuffer();
      variants.blurred = true;
    }

    // Persist variant buffers + flags. Use updateOne to avoid pulling
    // originalData again on save().
    const update = {
      width: meta.width,
      height: meta.height,
      bytes: original.length,
      status: 'ready',
      variants,
      thumbData: buffers.thumb,
      fullData: buffers.full,
    };
    if (buffers.blurred) update.blurredData = buffers.blurred;

    await Media.updateOne({ _id: mediaId }, { $set: update });

    return { mediaId, variants };
  } catch (err) {
    logger.error({ err, mediaId }, 'image processing failed');
    await Media.updateOne(
      { _id: mediaId },
      { $set: { status: 'failed', error: err.message } },
    );
    throw err;
  }
}
