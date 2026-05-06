import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as pkg from '../controllers/package.controller.js';

export const router = Router();

const createSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(80),
    description: z.string().max(500).optional(),
    price: z.number().nonnegative(),
    durationMinutes: z.number().int().nonnegative().nullable().optional(),
    active: z.boolean().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(80).optional(),
    description: z.string().max(500).optional(),
    price: z.number().nonnegative().optional(),
    durationMinutes: z.number().int().nonnegative().nullable().optional(),
    active: z.boolean().optional(),
  }),
});

router.use(requireAuth);

router.get('/me', asyncHandler(pkg.listMine));
router.post('/', validate(createSchema), asyncHandler(pkg.create));
router.patch('/:id', validate(updateSchema), asyncHandler(pkg.update));
router.delete('/:id', asyncHandler(pkg.remove));
