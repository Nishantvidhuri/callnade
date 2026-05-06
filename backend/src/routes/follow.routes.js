import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { followLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as follow from '../controllers/follow.controller.js';

export const router = Router();

const respondSchema = z.object({
  body: z.object({ action: z.enum(['accept', 'reject']) }),
});

const cursorSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

router.post('/request/:userId', requireAuth, followLimiter, asyncHandler(follow.request));
router.post('/respond/:requestId', requireAuth, validate(respondSchema), asyncHandler(follow.respond));
router.delete('/:userId', requireAuth, asyncHandler(follow.unfollow));
router.get('/requests/incoming', requireAuth, validate(cursorSchema), asyncHandler(follow.incoming));
router.get('/requests/outgoing', requireAuth, validate(cursorSchema), asyncHandler(follow.outgoing));
router.get('/followers/:userId', requireAuth, validate(cursorSchema), asyncHandler(follow.followers));
router.get('/following/:userId', requireAuth, validate(cursorSchema), asyncHandler(follow.following));
