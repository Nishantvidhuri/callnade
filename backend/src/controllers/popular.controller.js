import * as popularService from '../services/popular.service.js';

export async function popular(req, res) {
  res.json(
    await popularService.getPopular({
      ...req.query,
      adult: req.query?.adult === 'true' || req.query?.adult === '1',
      viewerId: req.user?.id || null,
    }),
  );
}
