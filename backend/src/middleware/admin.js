import { User } from '../models/user.model.js';
import { forbidden } from '../utils/HttpError.js';

export async function requireAdmin(req, _res, next) {
  try {
    const user = await User.findById(req.user.id).select('role isAdmin banned').lean();
    const isAdmin = user?.role === 'admin' || user?.isAdmin === true;
    if (!user || !isAdmin || user.banned) return next(forbidden('Admin only'));
    next();
  } catch (err) {
    next(err);
  }
}
