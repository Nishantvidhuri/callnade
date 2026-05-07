import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_ENDPOINT: z.string().default(''),
  CDN_BASE_URL: z.string().default(''),

  TURN_SECRET: z.string().default(''),
  TURN_HOST: z.string().default(''),
  TURN_TTL_SEC: z.coerce.number().default(600),

  // Razorpay payment-gateway credentials. Empty in dev / when wallet
  // top-ups are admin-mediated; required for the live /wallet/order
  // and /wallet/verify endpoints to work. The KEY_SECRET MUST never
  // ship to the frontend — only KEY_ID is exposed there.
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid env:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
