import { Router } from 'express';
import { router as healthRouter } from './health.routes.js';
import { router as authRouter } from './auth.routes.js';
import { router as userRouter } from './user.routes.js';
import { router as mediaRouter } from './media.routes.js';
import { router as followRouter } from './follow.routes.js';
import { router as popularRouter } from './popular.routes.js';
import { router as callRouter } from './call.routes.js';
import { router as adminRouter } from './admin.routes.js';
import { router as packageRouter } from './package.routes.js';
import { router as visitRouter } from './visit.routes.js';

export const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/media', mediaRouter);
router.use('/follow', followRouter);
router.use('/popular', popularRouter);
router.use('/calls', callRouter);
router.use('/admin', adminRouter);
router.use('/packages', packageRouter);
router.use('/visits', visitRouter);
