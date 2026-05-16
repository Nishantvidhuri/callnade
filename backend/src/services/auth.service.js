import argon2 from 'argon2';
import crypto from 'crypto';
import { customAlphabet } from 'nanoid';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/user.model.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import { badRequest, conflict, forbidden, unauthorized, internal } from '../utils/HttpError.js';
import { buildConsentPdf } from './consentPdf.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Lazy-init Google OAuth client. Only used by the /auth/google route
// — server can boot without a GOOGLE_CLIENT_ID (the route just 500s
// at call time with a clean message).
let _googleClient = null;
function googleClient() {
  if (_googleClient) return _googleClient;
  if (!env.GOOGLE_CLIENT_ID) {
    throw internal('Google sign-in is not configured on this server');
  }
  _googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  return _googleClient;
}

const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

// Custom alphabet for referral codes — uppercase letters + digits, with
// the easily-confused glyphs (0/O, 1/I/L) removed so users can read /
// type the code off a phone screen without misreading.
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateRef = customAlphabet(REF_ALPHABET, 8);

/**
 * Generate a unique referral code, retrying on the (vanishingly rare)
 * collision. 31^8 ≈ 850 billion possibilities; for our scale a single
 * attempt is practically certain to succeed.
 */
export async function mintReferralCode(maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateRef();
    // eslint-disable-next-line no-await-in-loop
    const taken = await User.exists({ referralCode: code });
    if (!taken) return code;
  }
  // Extremely unlikely fallback — bump length for the next try.
  return generateRef() + generateRef().slice(0, 2);
}

function tokensFor(user) {
  const payload = { sub: user._id.toString(), username: user.username };
  return {
    accessToken: signAccess(payload),
    refreshToken: signRefresh({ ...payload, ver: user.refreshTokenVersion }),
  };
}

export async function signup({ email, username, password, displayName, role, dateOfBirth, bio, consent, ip, referralCode }) {
  const exists = await User.findOne({ $or: [{ email }, { username }] }).lean();
  if (exists) {
    if (exists.email === email) throw conflict('Email already in use', 'EMAIL_TAKEN');
    throw conflict('Username already taken', 'USERNAME_TAKEN');
  }

  // Resolve the entered referral code to a referrer userId. Codes are
  // 8-char uppercase alphanumeric (see REF_ALPHABET). Loose matching:
  // we trim whitespace, drop a leading '#', and uppercase. A bad /
  // unknown code is treated as "no referrer" rather than blocking
  // signup — referral is a perk, not a gate.
  let referredBy = null;
  if (referralCode) {
    const cleaned = String(referralCode)
      .trim()
      .replace(/^[#@]+/, '')
      .toUpperCase();
    if (cleaned) {
      const referrer = await User.findOne({ referralCode: cleaned })
        .select('_id deletedAt banned')
        .lean();
      if (referrer && !referrer.deletedAt && !referrer.banned) {
        referredBy = referrer._id;
      }
    }
  }

  // Mint a code for the new user so they can refer others from day 1.
  const newReferralCode = await mintReferralCode();
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

  // Sign-up bonus: every regular user gets this so they can try a
  // creator call before topping up. Creators don't get one — they
  // earn, not spend. No referee-side bonus: the referral incentive
  // is paid out on top-ups (referrer gets 10% of every top-up),
  // not at signup.
  const SIGNUP_BONUS_CREDITS = 40;
  const initialWallet = safeRole === 'user' ? SIGNUP_BONUS_CREDITS : 0;

  const user = await User.create({
    email,
    username,
    passwordHash,
    displayName: displayName || '',
    bio: bio || '',
    role: safeRole,
    dateOfBirth: dob,
    consent: consentRecord,
    referredBy,
    referralCode: newReferralCode,
    walletBalance: initialWallet,
  });

  // Bump the referrer's count so they can see how many they've brought
  // in. Wallet credit only happens later, on top-up approval.
  if (referredBy) {
    User.updateOne({ _id: referredBy }, { $inc: { referralCount: 1 } }).catch(
      (err) => logger.error({ err, referredBy }, 'failed to bump referralCount'),
    );
  }

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

/**
 * Sign in (or sign up) with Google. The frontend hands over the ID
 * token returned by Google Identity Services; we verify it against
 * Google's public keys and either:
 *   - log in an existing user (matched by googleId, then by email),
 *   - or create a new account on the fly with sensible defaults.
 *
 * New accounts get the same 40-credit signup bonus as email signups.
 * They're created with role='user'; if they want to be a creator
 * later they can upgrade. We auto-accept the consent record using
 * Google's profile data (full name, current timestamp, IP) since the
 * user explicitly chose Google sign-in — there's no way to surface a
 * separate consent step inside the Google popup.
 */
export async function loginWithGoogle({ idToken, ip }) {
  if (!idToken) throw badRequest('Missing Google idToken');

  // Verify the token. Throws if the audience doesn't match our
  // configured client id, the signature is bad, or the token is
  // expired — i.e. anything sketchy.
  let payload;
  try {
    const ticket = await googleClient().verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    logger.warn({ err: err.message }, 'google idToken verify failed');
    throw unauthorized('Invalid Google sign-in');
  }
  if (!payload?.email_verified) {
    throw unauthorized('Google email is not verified');
  }

  const googleId = String(payload.sub);
  const email = String(payload.email).toLowerCase();
  const displayName = payload.name || '';
  // Profile picture URL (we don't download/store it here — could be
  // wired into the avatar upload pipeline later if desired).
  const picture = payload.picture || null;

  // Match-priority: exact googleId first (handles email changes on
  // Google's side), then email (links existing email/password
  // accounts to Google on first sign-in).
  let user = await User.findOne({ googleId });
  if (!user) user = await User.findOne({ email });

  if (user) {
    if (user.deletedAt) throw forbidden('Account no longer exists');
    if (user.banned) throw forbidden('Account banned');
    // Backfill googleId on the first link.
    if (!user.googleId) user.googleId = googleId;
    user.lastSeenAt = new Date();
    await user.save();
    return { user: user.toJSON(), ...tokensFor(user) };
  }

  // Create a new account. Username is derived from email + a random
  // suffix to avoid collisions; the user can rename later via
  // /users/me. Password is a random unguessable hash so the email/
  // password login path stays disabled until they set one via reset.
  const baseUsername = email
    .split('@')[0]
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18) || 'user';
  let username = `${baseUsername}_${customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 5)()}`;
  // Extreme edge case: collision against an existing username (very
  // rare given the random suffix). Retry up to 3 times.
  for (let i = 0; i < 3; i++) {
    if (!(await User.exists({ username }))) break;
    username = `${baseUsername}_${customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 5)()}`;
  }

  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await argon2.hash(randomPassword, ARGON_OPTS);
  const referralCode = await mintReferralCode();

  user = await User.create({
    email,
    username,
    passwordHash,
    displayName,
    role: 'user',
    googleId,
    referralCode,
    walletBalance: 40, // signup bonus, same as email signup
    consent: {
      // Auto-accept since the user explicitly chose Google sign-in.
      // Stored verbatim so the legal record exists.
      fullName: displayName || email,
      signature: displayName || email,
      acceptedAt: new Date(),
      version: 'google-oauth-v1',
      ip: ip || null,
    },
  });

  logger.info(
    { userId: String(user._id), email, source: 'google' },
    'created user via google sign-in',
  );

  return { user: user.toJSON(), ...tokensFor(user), isNew: true };
}

export async function login({ email, password }) {
  // `email` is the wire-name kept for backward compatibility, but the
  // value can be either an actual email OR a username. Guest accounts
  // get synthetic placeholder emails they'll never remember, so we
  // let them log in by their username too. Lookup picks the right
  // field based on whether the input contains an "@".
  const identifier = String(email || '').trim();
  if (!identifier) throw unauthorized('Invalid credentials');
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase() }
    : { username: identifier.toLowerCase() };
  const user = await User.findOne(query).select('+passwordHash');
  if (!user) throw unauthorized('Invalid credentials');
  if (user.deletedAt) throw forbidden('Account no longer exists');
  if (user.banned) throw forbidden('Account banned');
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw unauthorized('Invalid credentials');
  // Use updateOne instead of save() for the lastSeenAt write — it
  // skips full-document validation. Otherwise an unrelated bad row
  // (e.g. walletBalance drifted to -0.0001 from a billing
  // floating-point error) would 500 the login flow forever.
  user.lastSeenAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastSeenAt: user.lastSeenAt } });
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

/**
 * Frictionless guest signup — no email / password / consent typing.
 * Creates a regular `role: 'user'` account flagged `isGuest: true`
 * with a random unique username + an unguessable, throwaway password.
 * The viewer can browse, top up, even call creators; converting to a
 * real account later (claim flow) just patches email + password and
 * flips `isGuest` to false.
 *
 * Returns the same `{ user, accessToken, refreshToken }` shape as
 * signup so the controller can drop the refresh cookie + reply with
 * the access token unchanged.
 */
const GUEST_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const guestId = customAlphabet(GUEST_ID_ALPHABET, 10);
const SIGNUP_BONUS_CREDITS_GUEST = 40;
// Default plaintext password baked into every guest signup. Lets a
// guest who took the "Continue as Guest" path on one browser log in
// from a different browser using `<username> / password123`.
// Recoverability over secrecy — by design.
const GUEST_DEFAULT_PASSWORD = 'password123';

export async function createGuest({ ip } = {}) {
  // We retry up to 5 times in the (theoretical) case that random
  // ids collide with an existing row. 36^10 = ~3.6 quadrillion, so
  // a single collision is astronomically unlikely, but the loop
  // costs nothing.
  let user = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 5 && !user; attempt++) {
    const id = guestId();
    const username = `guest_${id}`;
    // Email is required + unique on the schema; we synthesise one in
    // a non-routable subdomain so claim-flow later just overwrites it.
    const email = `${username}@guest.callnade.site`;
    // Default guest password is `password123` — chosen for
    // recoverability, not security. A guest can pick "Continue as
    // guest" on browser A, then later log in with their username +
    // password123 on browser B (or change the password from the
    // profile settings). Each user still gets a unique argon2 hash
    // (different salt every call), so the on-disk hashes vary.
    const passwordHash = await argon2.hash(GUEST_DEFAULT_PASSWORD, { type: argon2.argon2id });
    const referralCode = await mintReferralCode();

    try {
      user = await User.create({
        email,
        username,
        passwordHash,
        displayName: 'Guest',
        role: 'user',
        isGuest: true,
        referralCode,
        walletBalance: SIGNUP_BONUS_CREDITS_GUEST,
        // Auto-accept consent — tapping "Continue as Guest" is the
        // affirmative action. Stash the IP for the audit trail.
        consent: {
          fullName: 'Guest',
          signature: 'Guest',
          acceptedAt: new Date(),
          version: 'guest-v1',
          ip: ip || null,
        },
      });
    } catch (err) {
      lastErr = err;
      // Duplicate key (E11000) → reroll. Anything else → bail.
      if (err?.code !== 11000) break;
    }
  }
  if (!user) {
    logger.error({ err: lastErr }, 'failed to create guest account');
    throw internal('Could not create guest account — please try again');
  }
  logger.info({ userId: String(user._id), username: user.username }, 'guest account created');
  return { user: user.toJSON(), ...tokensFor(user) };
}
