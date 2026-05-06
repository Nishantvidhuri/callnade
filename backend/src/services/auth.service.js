import argon2 from 'argon2';
import { User } from '../models/user.model.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import { badRequest, conflict, forbidden, unauthorized } from '../utils/HttpError.js';
import { buildConsentPdf } from './consentPdf.service.js';
import { logger } from '../config/logger.js';

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

function tokensFor(user) {
  const payload = { sub: user._id.toString(), username: user.username };
  return {
    accessToken: signAccess(payload),
    refreshToken: signRefresh({ ...payload, ver: user.refreshTokenVersion }),
  };
}

export async function signup({ email, username, password, displayName, role, dateOfBirth, bio, consent, ip }) {
  const exists = await User.findOne({ $or: [{ email }, { username }] }).lean();
  if (exists) {
    if (exists.email === email) throw conflict('Email already in use', 'EMAIL_TAKEN');
    throw conflict('Username already taken', 'USERNAME_TAKEN');
  }
  const safeRole = role === 'provider' ? 'provider' : 'user';

  let dob = null;
  if (dateOfBirth) {
    dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) throw badRequest('Invalid date of birth');
    const ageYears = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < 18) throw badRequest('You must be 18 or older');
  }
  if (safeRole === 'provider' && !dob) {
    throw badRequest('Date of birth is required for Creator accounts');
  }
  if (!consent || !consent.fullName || !consent.signature || !consent.acceptedAt) {
    throw badRequest('Full consent (including signature) is required');
  }

  const passwordHash = await argon2.hash(password, ARGON_OPTS);
  const consentRecord = {
    fullName: String(consent.fullName).slice(0, 200),
    signature: String(consent.signature).slice(0, 200),
    acceptedAt: new Date(consent.acceptedAt),
    version: consent.version ? String(consent.version).slice(0, 32) : null,
    ip: ip || null,
  };

  const user = await User.create({
    email,
    username,
    passwordHash,
    displayName: displayName || '',
    bio: bio || '',
    role: safeRole,
    dateOfBirth: dob,
    consent: consentRecord,
  });

  // Generate + persist the filled consent PDF. Non-fatal if it fails — the
  // signup still succeeds since we have the structured consent record.
  try {
    const pdfBuffer = await buildConsentPdf({ user, consent: consentRecord });
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          'consent.pdfData': pdfBuffer,
          'consent.pdfBytes': pdfBuffer.length,
        },
      },
    );
  } catch (err) {
    logger.error({ err, userId: user._id }, 'consent PDF generation failed');
  }

  return { user: user.toJSON(), ...tokensFor(user) };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) throw unauthorized('Invalid credentials');
  if (user.deletedAt) throw forbidden('Account no longer exists');
  if (user.banned) throw forbidden('Account banned');
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw unauthorized('Invalid credentials');
  user.lastSeenAt = new Date();
  await user.save();
  return { user: user.toJSON(), ...tokensFor(user) };
}

export async function refresh(refreshToken) {
  let payload;
  try {
    payload = verifyRefresh(refreshToken);
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const user = await User.findById(payload.sub);
  if (!user || user.banned || user.deletedAt || user.refreshTokenVersion !== payload.ver) {
    throw unauthorized('Refresh revoked');
  }
  return tokensFor(user);
}

export async function logout(userId) {
  await User.updateOne({ _id: userId }, { $inc: { refreshTokenVersion: 1 } });
}
