import * as followService from '../services/follow.service.js';

export async function request(req, res) {
  res.json(await followService.requestFollow(req.user.id, req.params.userId));
}

export async function respond(req, res) {
  res.json(await followService.respondToRequest(req.user.id, req.params.requestId, req.body.action));
}

export async function unfollow(req, res) {
  res.json(await followService.unfollow(req.user.id, req.params.userId));
}

export async function incoming(req, res) {
  res.json(await followService.listIncoming(req.user.id, req.query));
}

export async function outgoing(req, res) {
  res.json(await followService.listOutgoing(req.user.id, req.query));
}

export async function followers(req, res) {
  res.json(await followService.listFollowers(req.params.userId, req.query));
}

export async function following(req, res) {
  res.json(await followService.listFollowing(req.params.userId, req.query));
}
