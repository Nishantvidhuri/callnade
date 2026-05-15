import * as adminService from '../services/admin.service.js';
import * as walletService from '../services/wallet.service.js';
import * as paymentQrService from '../services/paymentQr.service.js';
import { notFound } from '../utils/HttpError.js';

export async function listUsers(req, res) {
  res.json(await adminService.listAllUsers(req.query));
}

export async function userDetails(req, res) {
  res.json(await adminService.getUserDetails(req.params.userId));
}

export async function verificationPhoto(req, res) {
  const out = await adminService.getVerificationPhoto(req.params.userId);
  if (!out) throw notFound('Verification photo not found');
  res.setHeader('Content-Type', out.contentType);
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('Content-Length', out.buffer.length);
  res.end(out.buffer);
}

export async function consentPdf(req, res) {
  const out = await adminService.getConsentPdf(req.params.userId);
  if (!out) throw notFound('Consent PDF not found');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="consent-${req.params.userId}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('Content-Length', out.buffer.length);
  res.end(out.buffer);
}

export async function ban(req, res) {
  res.json(await adminService.banUser(req.user.id, req.params.userId));
}

export async function unban(req, res) {
  res.json(await adminService.unbanUser(req.params.userId));
}

export async function softDelete(req, res) {
  res.json(await adminService.softDeleteUser(req.user.id, req.params.userId));
}

export async function restore(req, res) {
  res.json(await adminService.restoreUser(req.user.id, req.params.userId));
}

export async function activeCalls(_req, res) {
  res.json(await adminService.listActiveCalls());
}

export async function adjustWallet(req, res) {
  res.json(await adminService.adjustWallet(req.user.id, req.params.userId, req.body.delta));
}

export async function adjustEarnings(req, res) {
  res.json(await adminService.adjustEarnings(req.user.id, req.params.userId, req.body.delta));
}

export async function setRole(req, res) {
  res.json(await adminService.setRole(req.user.id, req.params.userId, req.body.role));
}

/* Wallet-request management. */

export async function listWalletRequests(req, res) {
  res.json(await walletService.adminListWalletRequests(req.query));
}

export async function walletStats(_req, res) {
  res.json(await walletService.adminWalletStats());
}

export async function approveTopup(req, res) {
  res.json(
    await walletService.adminApproveTopup(req.user.id, req.params.requestId, {
      adminNote: req.body?.adminNote,
    }),
  );
}

export async function approveWithdraw(req, res) {
  res.json(
    await walletService.adminApproveWithdraw(req.user.id, req.params.requestId, {
      adminNote: req.body?.adminNote,
    }),
  );
}

export async function rejectWalletRequest(req, res) {
  res.json(
    await walletService.adminRejectWalletRequest(req.user.id, req.params.requestId, {
      adminNote: req.body?.adminNote,
    }),
  );
}

/* Payment-QR pool (admin-managed, shown on user-side topup form). */

export async function listPaymentQrs(_req, res) {
  res.json(await paymentQrService.listPaymentQrs());
}

export async function uploadPaymentQr(req, res) {
  res.json(
    await paymentQrService.uploadPaymentQr({
      buffer: req.body, // raw Buffer thanks to express.raw
      contentType: req.headers['content-type'] || '',
      label: req.query.label,
      upiId: req.query.upiId,
      uploadedBy: req.user.id,
    }),
  );
}

export async function togglePaymentQr(req, res) {
  res.json(
    await paymentQrService.setActive(req.params.id, req.body?.active),
  );
}

export async function deletePaymentQr(req, res) {
  res.json(await paymentQrService.deletePaymentQr(req.params.id));
}

export async function withdrawQr(req, res) {
  const out = await walletService.adminGetWithdrawQr(req.params.requestId);
  if (!out) throw notFound('QR not found');
  // R2 path: 302 to the public URL so the browser fetches it directly.
  // Saves us streaming bytes through the API.
  if (out.redirectUrl) {
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.redirect(302, out.redirectUrl);
  }
  res.setHeader('Content-Type', out.contentType);
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('Content-Length', out.buffer.length);
  res.end(out.buffer);
}

export async function getRazorpayEnabled(_req, res) {
  res.json({ enabled: await walletService.getRazorpayEnabled() });
}

export async function setRazorpayEnabled(req, res) {
  const enabled = await walletService.setRazorpayEnabled(req.body.enabled);
  res.json({ enabled });
}
