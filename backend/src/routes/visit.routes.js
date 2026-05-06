import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as visit from '../controllers/visit.controller.js';

export const router = Router();

const logSchema = z.object({
  body: z.object({
    language: z.string().max(32).optional(),
    timezone: z.string().max(64).optional(),
    screen: z.string().max(32).optional(),
    viewport: z.string().max(32).optional(),
    dpr: z.number().optional(),
    referrer: z.string().max(500).optional(),
    path: z.string().max(200).optional(),
  }),
});

const listSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

// POST /visits — public (visitors and signed-in users both log)
router.post('/', optionalAuth, validate(logSchema), asyncHandler(visit.log));

// GET /visits — admin only, lives under /api/v1/visits for symmetry but
// require the admin gate before reading.
router.get('/', requireAuth, requireAdmin, validate(listSchema), asyncHandler(visit.list));
