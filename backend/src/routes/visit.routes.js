import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as visit from '../controllers/visit.controller.js';

export const router = Router();

// Browser-collected fields are mostly optional and may be `null` when the
// browser doesn't expose them (e.g. `document.referrer` is null on direct
// loads). Accept either a string OR null for every field so the client can
// send a uniform shape — null is normalised to "missing" inside the
// service layer.
const logSchema = z.object({
  body: z.object({
    language: z.string().max(32).nullable().optional(),
    timezone: z.string().max(64).nullable().optional(),
    screen: z.string().max(32).nullable().optional(),
    viewport: z.string().max(32).nullable().optional(),
    dpr: z.number().nullable().optional(),
    referrer: z.string().max(500).nullable().optional(),
    path: z.string().max(200).nullable().optional(),
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
