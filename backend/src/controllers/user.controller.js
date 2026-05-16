import * as userService from '../services/user.service.js';

export async function me(req, res) {
  res.json(await userService.getMe(req.user.id));
}

export async function updateMe(req, res) {
  res.json(await userService.updateMe(req.user.id, req.body));
}

export async function publicProfile(req, res) {
  res.json(await userService.getPublicProfile(req.params.username, req.user?.id));
}

export async function discover(req, res) {
  res.json(await userService.discover({ ...req.query, excludeUserId: req.user.id }));
}

export async function search(req, res) {
  res.json(await userService.search(req.query.q, req.query));
}

export async function myFollowing(req, res) {
  res.json(await userService.listMyFollowing(req.user.id, req.query));
}

export async function mutuals(req, res) {
  res.json(await userService.listMutuals(req.user.id, req.query));
}

export async function online(req, res) {
  res.json(await userService.listOnline({
    ...req.query,
    adult: req.query?.adult === 'true' || req.query?.adult === '1',
    excludeUserId: req.user?.id,
  }));
}

export async function upgradeToProvider(req, res) {
  res.json(await userService.upgradeToProvider(req.user.id));
}

