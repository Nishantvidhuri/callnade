import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * ZegoCloud token04 generator.
 *
 * Token04 is Zego's standard auth token format for the Express SDK.
 * The client SDK calls `loginRoom(roomID, token, userInfo)` with one
 * of these tokens; if it's valid, the SDK is allowed to publish /
 * subscribe streams in that room.
 *
 * Format (from Zego's published algorithm):
 *   "04" + base64( int64BE(expire)
 *                | int16BE(ivLen) | iv
 *                | int16BE(ctLen) | AES-256-CBC(serverSecret, payload) )
 *
 * payload JSON shape:
 *   { app_id, user_id, nonce, ctime, expire, payload }
 *
 * Server Secret must be exactly 32 ASCII characters (it's used
 * directly as the AES-256 key).
 */
export function generateToken04({
  appId,
  userId,
  secret,
  effectiveTimeInSeconds,
  payload = '',
}) {
  if (!appId) throw new Error('zego: missing appId');
  if (!userId) throw new Error('zego: missing userId');
  if (!secret || secret.length !== 32) {
    throw new Error('zego: server secret must be 32 characters');
  }
  if (!effectiveTimeInSeconds || effectiveTimeInSeconds <= 0) {
    throw new Error('zego: effectiveTimeInSeconds must be positive');
  }

  const ctime = Math.floor(Date.now() / 1000);
  const expire = ctime + effectiveTimeInSeconds;
  const info = {
    app_id: appId,
    user_id: String(userId),
    nonce: (Math.random() * 0x7fffffff) | 0,
    ctime,
    expire,
    payload: payload || '',
  };

  const plaintext = Buffer.from(JSON.stringify(info), 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secret, 'utf8'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const expireBuf = Buffer.alloc(8);
  expireBuf.writeBigInt64BE(BigInt(expire), 0);
  const ivLenBuf = Buffer.alloc(2);
  ivLenBuf.writeInt16BE(iv.length, 0);
  const ctLenBuf = Buffer.alloc(2);
  ctLenBuf.writeInt16BE(ciphertext.length, 0);

  const packed = Buffer.concat([expireBuf, ivLenBuf, iv, ctLenBuf, ciphertext]);
  return '04' + packed.toString('base64');
}

/**
 * Convenience wrapper that pulls config from env and produces a
 * token for the given user. Used by the /zego/token endpoint.
 */
export function mintZegoToken(userId, { roomId } = {}) {
  if (!env.ZEGO_APP_ID || !env.ZEGO_SERVER_SECRET) {
    throw new Error('ZEGO_APP_ID / ZEGO_SERVER_SECRET not configured');
  }
  // Optional room-scoped payload so the token can only join the
  // single intended room. The SDK will reject join attempts to any
  // other room id.
  const payload = roomId
    ? JSON.stringify({
        room_id: String(roomId),
        privilege: { 1: 1, 2: 1 }, // 1=loginRoom, 2=publishStream
        stream_id_list: null,
      })
    : '';
  return generateToken04({
    appId: env.ZEGO_APP_ID,
    userId,
    secret: env.ZEGO_SERVER_SECRET,
    effectiveTimeInSeconds: env.ZEGO_TOKEN_TTL_SEC,
    payload,
  });
}
