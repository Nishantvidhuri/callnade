import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { mintZegoToken } from '../services/zego.service.js';
import { env } from '../config/env.js';

export const router = Router();

/**
 * GET /api/v1/zego/token?room=<callId>
 *
 * Mints a Zego token04 for the authenticated user, optionally
 * scoped to a single room (so a leaked token can't be reused for
 * other rooms). The frontend hits this right before joining a
 * room — token TTL is 3h so a single token comfortably outlasts
 * any normal call.
 */
router.get(
  '/token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId = req.query.room ? String(req.query.room) : null;
    const token = mintZegoToken(req.user.id, { roomId });
    res.json({
      appId: env.ZEGO_APP_ID,
      userId: String(req.user.id),
      token,
      roomId,
      expiresInSec: env.ZEGO_TOKEN_TTL_SEC,
    });
  }),
);
