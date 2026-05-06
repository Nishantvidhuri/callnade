import * as visitService from '../services/visit.service.js';

export async function log(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
  const userAgent = req.headers['user-agent'] || null;
  await visitService.logVisit({
    userId: req.user?.id || null,
    ip,
    userAgent,
    ...req.body,
  });
  res.json({ ok: true });
}

export async function list(req, res) {
  res.json(await visitService.listVisits(req.query));
}
