import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as admin from '../controllers/admin.controller.js';

export const router = Router();

const listSchema = z.object({
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().max(60).optional(),
  }),
});

router.use(requireAuth, requireAdmin);

const walletSchema = z.object({
  body: z.object({
    delta: z.number().finite().refine((n) => n !== 0, 'delta cannot be 0'),
  }),
});

const roleSchema = z.object({
  body: z.object({
    role: z.enum(['user', 'provider', 'admin']),
  }),
});

router.get('/users', validate(listSchema), asyncHandler(admin.listUsers));
router.get('/users/:userId/details', asyncHandler(admin.userDetails));
router.get('/users/:userId/verification', asyncHandler(admin.verificationPhoto));
router.get('/users/:userId/consent.pdf', asyncHandler(admin.consentPdf));
router.post('/users/:userId/ban', asyncHandler(admin.ban));
router.post('/users/:userId/unban', asyncHandler(admin.unban));
router.post('/users/:userId/soft-delete', asyncHandler(admin.softDelete));
router.post('/users/:userId/restore', asyncHandler(admin.restore));
router.post('/users/:userId/wallet', validate(walletSchema), asyncHandler(admin.adjustWallet));
router.post('/users/:userId/earnings', validate(walletSchema), asyncHandler(admin.adjustEarnings));
router.post('/users/:userId/role', validate(roleSchema), asyncHandler(admin.setRole));
router.get('/calls/active', asyncHandler(admin.activeCalls));
