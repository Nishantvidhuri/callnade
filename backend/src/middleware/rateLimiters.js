import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis.js';

const store = () =>
  new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  });

export const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: store(),
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: store(),
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: store(),
});

export const followLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: store(),
});
