import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';

const store = () =>
  new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  });

// In development we sidestep rate limits entirely so iterating on
// login/signup flows in the browser doesn't choke on 429s. Production
// keeps real limits — this would otherwise be a brute-force vector.
const skipInDev = () => env.NODE_ENV !== 'production';

export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  store: store(),
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  // Bumped from 30/min — modern web apps can fire several auth-side
  // requests on a single page open (login + refresh + Google), and
  // hot-reloading a dev page chews through the budget quickly.
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  store: store(),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  store: store(),
});

export const followLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  store: store(),
});
