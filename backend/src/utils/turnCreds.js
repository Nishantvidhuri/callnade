import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function makeTurnCredentials(userId) {
  const stun = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  if (!env.TURN_SECRET || !env.TURN_HOST) {
    return { iceServers: stun };
  }
  const ttl = env.TURN_TTL_SEC;
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiry}:${userId}`;
  const credential = crypto.createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
  return {
    ttl,
    iceServers: [
      ...stun,
      {
        urls: [`turn:${env.TURN_HOST}?transport=udp`, `turn:${env.TURN_HOST}?transport=tcp`],
        username,
        credential,
      },
    ],
  };
}
