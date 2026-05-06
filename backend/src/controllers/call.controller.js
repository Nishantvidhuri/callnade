import * as callService from '../services/call.service.js';

export async function ice(req, res) {
  res.json(await callService.iceConfigFor(req.user.id));
}

export async function history(req, res) {
  res.json(await callService.callHistory(req.user.id));
}
