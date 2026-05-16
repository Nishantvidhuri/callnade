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
    password: z.string().min(6).max(128),
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

// The `email` field is overloaded — it can be either an actual
// email OR a username (guest accounts use the latter since their
// synthetic email is unmemorable). The service decides which to
// query based on whether it sees an "@". Validation is loose enough
// to accept both shapes.
const loginSchema = z.object({
  body: z.object({
    email: z.string().min(2).max(120),
    password: z.string().min(6).max(128),
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
// Guest account — no body, no email/password. Rate-limited like the
// other auth endpoints so a bot can't spawn a million rows.
router.post('/guest', authLimiter, asyncHandler(auth.guest));
router.post('/refresh', asyncHandler(auth.refresh));
router.post('/logout', requireAuth, asyncHandler(auth.logout));
