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

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccess(header.slice(7));
    req.user = { id: payload.sub, username: payload.username };
  } catch {
    /* ignore */
  }
  next();
}
