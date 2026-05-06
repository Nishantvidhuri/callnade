import * as popularService from '../services/popular.service.js';

export async function popular(req, res) {
  res.json(
    await popularService.getPopular({
      ...req.query,
      viewerId: req.user?.id || null,
    }),
  );
}
