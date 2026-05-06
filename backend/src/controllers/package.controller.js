import * as packageService from '../services/package.service.js';

export async function listMine(req, res) {
  res.json(await packageService.listMyPackages(req.user.id));
}

export async function create(req, res) {
  res.json(await packageService.createPackage(req.user.id, req.body));
}

export async function update(req, res) {
  res.json(await packageService.updatePackage(req.user.id, req.params.id, req.body));
}

export async function remove(req, res) {
  res.json(await packageService.deletePackage(req.user.id, req.params.id));
}
