import * as authService from '../services/auth.service.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE = 'refreshToken';

const cookieOpts = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
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
