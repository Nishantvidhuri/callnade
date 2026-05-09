import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiters.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as auth from '../controllers/auth.controller.js';

export const router = Router();

const signupSchema = z.object({
  body: z.object({
    email: z.string().email(),
    username: z
      .string()
      .min(3)
      .max(24)
      .regex(/^[a-z0-9_]+$/i)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(8).max(128),
    displayName: z.string().max(60).optional(),
    role: z.enum(['user', 'provider']).optional(),
    dateOfBirth: z.string().optional(),
    bio: z.string().max(280).optional(),
    consent: z.object({
      fullName: z.string().min(2).max(200),
      signature: z.string().min(2).max(200),
      acceptedAt: z.string(),
      version: z.string().max(32).nullable().optional(),
    }),
    // Optional referral code (the referrer's username). Loose
    // validation here — the service does the actual lookup and
    // silently ignores anything that doesn't resolve.
    referralCode: z.string().max(32).optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
  }),
});

const googleSchema = z.object({
  body: z.object({
    idToken: z.string().min(1),
  }),
});

router.post('/signup', authLimiter, validate(signupSchema), asyncHandler(auth.signup));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(auth.login));
router.post('/google', authLimiter, validate(googleSchema), asyncHandler(auth.googleLogin));
router.post('/refresh', asyncHandler(auth.refresh));
router.post('/logout', requireAuth, asyncHandler(auth.logout));
