import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as popular from '../controllers/popular.controller.js';

export const router = Router();

const schema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    adult: z.enum(['true', 'false', '0', '1']).optional(),
  }),
});

// optionalAuth: lets us see who's calling (so we can hide them from their
// own popular list) without requiring auth — anonymous visitors still see
// the page.
router.get('/', optionalAuth, validate(schema), asyncHandler(popular.popular));
