import { verifyAccess } from '../utils/jwt.js';
import { unauthorized } from '../utils/HttpError.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('Missing token'));
  try {
    const payload = verifyAccess(header.slice(7));
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    next(unauthorized('Invalid token'));
  }
}

/**
 * Like requireAuth, but anonymous requests are still allowed through
 * — `req.user` is only set when a valid token is presented.
 *
 * If a token IS sent but is malformed or expired, we return 401 so
 * the frontend's response interceptor can refresh and retry. Silently
 * dropping the user identity here used to cause routes like
 * /u/:username to return 404 for the admin's own profile when their
 * access token had quietly expired (the route 404s admin profiles
 * for non-owners, and an expired token makes everyone look like a
 * non-owner).
 */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccess(header.slice(7));
    req.user = { id: payload.sub, username: payload.username };
    return next();
  } catch {
    return next(unauthorized('Invalid token'));
  }
}
