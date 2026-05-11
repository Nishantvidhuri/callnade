import agoraToken from 'agora-token';
import { env } from '../config/env.js';

// agora-token ships CJS; named ESM re-exports are spotty across
// Node versions (Node 26 in particular only surfaces `default`).
// Destructuring from the default import is the portable path.
const { RtcTokenBuilder, RtcRole } = agoraToken;

/**
 * Mint an Agora RTC token for the given channel + uid.
 *
 * `uid` MUST be a 32-bit unsigned int (Agora requirement when using
 * the int-uid variant of the token builder). We derive it from the
 * user's Mongo _id via a stable djb2 hash so the same user always
 * gets the same uid across reconnects — important so each peer sees
 * a consistent identity when listing remote users.
 *
 * Channel name is whatever the caller passes (typically the app's
 * `callId`); we trust the caller to scope this to a single call so a
 * leaked token can't be reused on other channels.
 *
 * Role is PUBLISHER for both peers — viewer / spectator (admin
 * moderation) can be added later via RtcRole.SUBSCRIBER.
 */
export function mintAgoraToken({ channel, userId }) {
  if (!env.AGORA_APP_ID || !env.AGORA_APP_CERT) {
    throw new Error('Agora is not configured on this server');
  }
  if (!channel) throw new Error('channel is required');
  if (!userId) throw new Error('userId is required');

  const uid = uidFromUserId(String(userId));
  const role = RtcRole.PUBLISHER;
  // Token expiry is wall-clock seconds since epoch. Agora's SDK also
  // takes a privilege-expire timestamp; we pass the same value for
  // both since we don't downgrade privileges mid-call.
  const expiresAt = Math.floor(Date.now() / 1000) + env.AGORA_TOKEN_TTL_SEC;
  const token = RtcTokenBuilder.buildTokenWithUid(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERT,
    String(channel),
    uid,
    role,
    expiresAt,
    expiresAt,
  );
  return { token, uid, channel: String(channel), expiresAt };
}

/**
 * djb2 hash of the user's ObjectId hex string → 32-bit uint. Stable
 * (same input always produces same output) and uniformly distributed
 * enough for Agora's 2^32 uid space.
 */
function uidFromUserId(id) {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0; // keep unsigned
  }
  // Agora reserves uid=0 as "auto-assign" — bump to 1 if we hit it.
  return hash === 0 ? 1 : hash;
}
