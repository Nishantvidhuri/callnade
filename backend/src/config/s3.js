import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

// Works with AWS S3, Cloudflare R2, MinIO and other S3-compatible stores.
// For R2: set S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com and S3_REGION=auto.
//
// Note on checksums: AWS SDK v3 (>=3.729) added "flexible checksums" that
// auto-injects an x-amz-checksum-crc32 header into every PutObject request and
// includes it in the signed headers list. Cloudflare R2 does not accept that
// header, so signed PUTs fail with "checksum/signature mismatch". Setting both
// flags to WHEN_REQUIRED disables it for any operation that doesn't strictly
// need it (which is everything we do).
export const s3 = new S3Client({
  region: env.S3_REGION || 'auto',
  endpoint: env.S3_ENDPOINT || undefined,
  // R2 + most non-AWS providers prefer path-style addressing.
  forcePathStyle: !!env.S3_ENDPOINT,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials:
    env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
});

export const S3_BUCKET = env.S3_BUCKET;
export const CDN_BASE_URL = env.CDN_BASE_URL;
