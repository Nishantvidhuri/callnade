import * as authService from '../services/auth.service.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE = 'refreshToken';

// Match the cookie lifetime to JWT_REFRESH_TTL so the cookie and the
// signed token expire together. We parse the env string (e.g. "3650d",
// "30d", "12h", "60m", "120s") into milliseconds. Falls back to 10y
// if the format ever drifts — same "effectively forever" default the
// JWT layer uses.
const TTL_RE = /^(\d+)\s*(s|m|h|d)?$/i;
const TTL_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
function refreshCookieMaxAgeMs() {
  const m = TTL_RE.exec(String(env.JWT_REFRESH_TTL || '').trim());
  if (!m) return 3650 * 86_400_000; // 10y safety net
  const n = Number(m[1]);
  const unit = (m[2] || 'd').toLowerCase();
  return n * (TTL_MS[unit] || TTL_MS.d);
}

const cookieOpts = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: refreshCookieMaxAgeMs(),
});

function sendAuth(res, { user, accessToken, refreshToken }) {
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts());
  return res.json({ user, accessToken });
}

export async function signup(req, res) {
  const result = await authService.signup({ ...req.body, ip: req.ip });
  sendAuth(res, result);
}

export async function login(req, res) {
  const result = await authService.login(req.body);
  sendAuth(res, result);
}

export async function googleLogin(req, res) {
  const result = await authService.loginWithGoogle({
    idToken: req.body?.idToken,
    ip: req.ip,
  });
  sendAuth(res, result);
}

/**
 * No-body endpoint that mints a frictionless guest account. Behind
 * the same auth rate limiter as signup/login so it can't be used as
 * a DB-row-flood vector.
 */
export async function guest(req, res) {
  const result = await authService.createGuest({ ip: req.ip });
  sendAuth(res, result);
}

export async function refresh(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: { message: 'No refresh token' } });
  const tokens = await authService.refresh(token);
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOpts());
  res.json({ accessToken: tokens.accessToken });
}

export async function logout(req, res) {
  if (req.user) await authService.logout(req.user.id);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.json({ ok: true });
}
