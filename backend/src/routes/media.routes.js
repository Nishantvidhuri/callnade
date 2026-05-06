import { Router } from 'express';
import express from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimiters.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as media from '../controllers/media.controller.js';

export const router = Router();

// Direct binary upload — body is the raw image bytes.
// Query params: ?kind=avatar | ?kind=gallery&position=N (0..8)
const rawBody = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '10mb',
});

router.post('/upload', requireAuth, uploadLimiter, rawBody, asyncHandler(media.upload));
router.get('/:id/raw', optionalAuth, asyncHandler(media.raw));
router.delete('/:id', requireAuth, asyncHandler(media.remove));
router.get('/:id/signed', optionalAuth, asyncHandler(media.signed));
