import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { mintAgoraToken } from '../services/agora.service.js';
import { env } from '../config/env.js';

export const router = Router();

/**
 * GET /api/v1/agora/token?channel=<channelName>
 *
 * Mints an RTC token for the authed user joining `channel`. The
 * frontend hits this right before `client.join()`. Token TTL is set
 * via AGORA_TOKEN_TTL_SEC (default 3h, longer than any normal call).
 *
 * Channel can be anything for the standalone /agora-test sandbox;
 * once we wire it into the real call flow we'll scope it to the
 * app-level `callId` so a leaked token can't be replayed elsewhere.
 */
router.get(
  '/token',
  requireAuth,
  asyncHandler(async (req, res) => {
    const channel = req.query.channel ? String(req.query.channel) : null;
    if (!channel) {
      return res.status(400).json({
        error: { message: 'channel is required', code: 'VALIDATION' },
      });
    }
    const { token, uid, expiresAt } = mintAgoraToken({
      channel,
      userId: req.user.id,
    });
    res.json({
      appId: env.AGORA_APP_ID,
      channel,
      uid,
      token,
      expiresAt,
    });
  }),
);
