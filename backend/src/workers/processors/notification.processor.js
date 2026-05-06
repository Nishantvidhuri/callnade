import { logger } from '../../config/logger.js';

export async function sendNotification(job) {
  const { kind, toUserId, payload } = job.data;
  logger.info({ kind, toUserId, payload }, 'notification dispatch (stub)');
  return { ok: true };
}
