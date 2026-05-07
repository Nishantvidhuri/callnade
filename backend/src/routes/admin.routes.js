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

// Wallet-request review queue. Admin sees both top-ups (incoming
// money) and withdrawals (outgoing money) and approves/rejects.
const walletRequestsListSchema = z.object({
  query: z.object({
    type: z.enum(['topup', 'withdraw']).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
const walletRequestActionSchema = z.object({
  body: z.object({ adminNote: z.string().max(500).optional() }),
});

router.get('/wallet-requests', validate(walletRequestsListSchema), asyncHandler(admin.listWalletRequests));
router.get('/wallet-stats', asyncHandler(admin.walletStats));
router.post('/wallet-requests/:requestId/approve-topup', validate(walletRequestActionSchema), asyncHandler(admin.approveTopup));
router.post('/wallet-requests/:requestId/approve-withdraw', validate(walletRequestActionSchema), asyncHandler(admin.approveWithdraw));
router.post('/wallet-requests/:requestId/reject', validate(walletRequestActionSchema), asyncHandler(admin.rejectWalletRequest));
router.get('/wallet-requests/:requestId/qr', asyncHandler(admin.withdrawQr));
