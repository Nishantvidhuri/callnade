import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as call from '../controllers/call.controller.js';

export const router = Router();

router.post('/ice-config', requireAuth, asyncHandler(call.ice));
router.get('/history', requireAuth, asyncHandler(call.history));
router.get('/transactions', requireAuth, asyncHandler(call.transactions));
