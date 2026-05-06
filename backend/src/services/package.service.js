import { Package } from '../models/package.model.js';
import { User } from '../models/user.model.js';
import { badRequest, forbidden, notFound } from '../utils/HttpError.js';

async function ensureProvider(userId) {
  const u = await User.findById(userId).select('role').lean();
  if (!u || (u.role !== 'provider' && u.role !== 'admin')) {
    throw forbidden('Only service providers can manage packages');
  }
}

export async function listMyPackages(userId) {
  const items = await Package.find({ providerId: userId }).sort({ createdAt: -1 }).lean();
  return { items: items.map(format) };
}

export async function listForProvider(providerId, { onlyActive = true } = {}) {
  const filter = { providerId };
  if (onlyActive) filter.active = true;
  const items = await Package.find(filter).sort({ createdAt: -1 }).lean();
  return { items: items.map(format) };
}

export async function createPackage(userId, payload) {
  await ensureProvider(userId);
  if (payload.price < 0) throw badRequest('Price must be ≥ 0');
  const pkg = await Package.create({
    providerId: userId,
    title: payload.title,
    description: payload.description || '',
    price: payload.price,
    durationMinutes: payload.durationMinutes ?? null,
    callType: payload.callType === 'audio' ? 'audio' : 'video',
    active: payload.active !== false,
  });
  return format(pkg.toObject());
}

export async function updatePackage(userId, packageId, patch) {
  await ensureProvider(userId);
  const pkg = await Package.findById(packageId);
  if (!pkg) throw notFound('Package not found');
  if (String(pkg.providerId) !== String(userId)) throw forbidden();
  const allowed = (({ title, description, price, durationMinutes, callType, active }) => ({
    title, description, price, durationMinutes, callType, active,
  }))(patch);
  if ('callType' in allowed && allowed.callType !== undefined) {
    allowed.callType = allowed.callType === 'audio' ? 'audio' : 'video';
  }
  Object.entries(allowed).forEach(([k, v]) => {
    if (v !== undefined) pkg[k] = v;
  });
  if (pkg.price < 0) throw badRequest('Price must be ≥ 0');
  await pkg.save();
  return format(pkg.toObject());
}

export async function deletePackage(userId, packageId) {
  const pkg = await Package.findById(packageId);
  if (!pkg) throw notFound('Package not found');
  if (String(pkg.providerId) !== String(userId)) throw forbidden();
  await pkg.deleteOne();
  return { ok: true };
}

function format(p) {
  return {
    id: String(p._id),
    providerId: String(p.providerId),
    title: p.title,
    description: p.description || '',
    price: p.price,
    durationMinutes: p.durationMinutes ?? null,
    callType: p.callType || 'video',
    active: !!p.active,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
