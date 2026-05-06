import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as users from '../controllers/user.controller.js';

export const router = Router();

const updateMeSchema = z.object({
  body: z.object({
    displayName: z.string().max(60).optional(),
    bio: z.string().max(280).optional(),
    isPrivate: z.boolean().optional(),
    isAdult: z.boolean().optional(),
  }),
});

const cursorSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

const searchSchema = z.object({
  query: z.object({
    q: z.string().max(60).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

router.get('/me', requireAuth, asyncHandler(users.me));
router.patch('/me', requireAuth, validate(updateMeSchema), asyncHandler(users.updateMe));
router.post('/me/become-creator', requireAuth, asyncHandler(users.upgradeToProvider));
router.get('/me/following', requireAuth, validate(cursorSchema), asyncHandler(users.myFollowing));
router.get('/me/mutuals', requireAuth, asyncHandler(users.mutuals));

router.get('/discover', requireAuth, validate(cursorSchema), asyncHandler(users.discover));
router.get('/online', optionalAuth, asyncHandler(users.online));
router.get('/search', requireAuth, validate(searchSchema), asyncHandler(users.search));

router.get('/:username', optionalAuth, asyncHandler(users.publicProfile));
