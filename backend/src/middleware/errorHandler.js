import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { HttpError } from '../utils/HttpError.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res
      .status(400)
      .json({ error: { message: 'Validation failed', code: 'VALIDATION', issues: err.issues } });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  }
  if (err?.code === 11000) {
    return res
      .status(409)
      .json({ error: { message: 'Duplicate value', code: 'DUPLICATE', keys: Object.keys(err.keyPattern || {}) } });
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL' } });
}
