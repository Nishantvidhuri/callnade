import { redis } from '../../config/redis.js';
import { User } from '../../models/user.model.js';

/**
 * Presence model. Two Redis keys per user:
 *
 *   presence:{userId}  — set while the user has an open socket. 60s
 *                        TTL refreshed every 30s (heartbeat). Absence
 *                        of this key === offline.
 *
 *   busy:{userId}      — set while the user is in a connected call.
 *                        Stores the callId. 6h TTL as a fail-safe so
 *                        a crashed server can't strand a user as
 *                        "busy" forever. Cleared explicitly by
 *                        endCall() in call.handlers.js.
 *
 * Status priority: busy > online > offline. The frontend gets a
 * `presence:update` socket broadcast each time any of those keys
 * flips, so the dot updates without a page refresh.
 */

const PRESENCE_TTL = 60;
const BUSY_TTL = 6 * 60 * 60; // 6 hours, longer than any reasonable call

const presenceKey = (id) => `presence:${id}`;
const busyKey = (id) => `busy:${id}`;

export async function setBusy(userId, callId) {
  await redis.set(busyKey(userId), String(callId), 'EX', BUSY_TTL);
}

export async function clearBusy(userId) {
  await redis.del(busyKey(userId));
}

export async function getStatus(userId) {
  const [online, busy] = await redis.mget(presenceKey(userId), busyKey(userId));
  if (busy) return 'busy';
  if (online) return 'online';
  // No socket — but `alwaysOnline` accounts still report online
  // (their busy state is checked first via the early return above).
  // One indexed lookup; cheap enough for the rare offline path.
  const u = await User.findById(userId).select('alwaysOnline').lean();
  if (u?.alwaysOnline) return 'online';
  return 'offline';
}

/**
 * Bulk variant for listing endpoints. One round-trip via mget; we
 * concatenate presence + busy keys and split the result. Returns a
 * Map<string-userId, 'online' | 'busy' | 'offline'>.
 *
 * For users who came back as 'offline' from Redis, we batch-check
 * the `alwaysOnline` flag in a single Mongo query and upgrade them
 * to 'online'. Saves N round trips.
 */
export async function getStatusMap(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const presKeys = ids.map((id) => presenceKey(id));
  const busyKeys = ids.map((id) => busyKey(id));
  const all = await redis.mget(...presKeys, ...busyKeys);
  const offlineIds = [];
  ids.forEach((id, i) => {
    const online = all[i];
    const busy = all[ids.length + i];
    const status = busy ? 'busy' : online ? 'online' : 'offline';
    out.set(String(id), status);
    if (status === 'offline') offlineIds.push(id);
  });
  if (offlineIds.length) {
    const sticky = await User.find({
      _id: { $in: offlineIds },
      alwaysOnline: true,
    })
      .select('_id')
      .lean();
    for (const u of sticky) out.set(String(u._id), 'online');
  }
  return out;
}

/**
 * Returns the set of userIds that should be treated as "always
 * online" — used by listOnline to union them with the Redis-scanned
 * connected users. Indexed on `alwaysOnline`, so this is one fast
 * lookup against Mongo per request.
 */
export async function getAlwaysOnlineIds() {
  const rows = await User.find({ alwaysOnline: true }).select('_id').lean();
  return rows.map((r) => String(r._id));
}

/**
 * Re-read the current status from Redis and broadcast to every
 * connected socket. Cheap (two Redis lookups + a fan-out emit) and
 * correct under contention — we always send the latest source-of-
 * truth state, never a stale local snapshot.
 *
 * Scope is intentionally global for now: the platform is small enough
 * that everyone hearing about everyone's status is fine, and the
 * alternative (room-per-creator subscriptions tied to which cards are
 * on screen) adds a lot of bookkeeping for not much win.
 */
export async function broadcastStatus(io, userId) {
  const status = await getStatus(userId);
  io.emit('presence:update', { userId: String(userId), status });
}

export function registerPresenceHandlers(io, socket) {
  const userId = socket.user.id;
  const key = presenceKey(userId);

  redis.set(key, '1', 'EX', PRESENCE_TTL);
  // First broadcast on connect — covers the case where a stale `busy`
  // key from a crashed server is still around (broadcast publishes
  // 'busy', which is correct), and the normal case of a fresh connect
  // (publishes 'online').
  broadcastStatus(io, userId).catch(() => {});

  const ping = setInterval(() => redis.expire(key, PRESENCE_TTL), 30_000);

  socket.on('disconnect', async () => {
    clearInterval(ping);
    await redis.del(key);
    // Note: we do NOT clear `busy` here. If the user is mid-call, the
    // call state is the source of truth — they're still busy from
    // their peer's perspective. endCall() will clear it. A truly
    // abandoned busy key falls off via its 6h TTL.
    broadcastStatus(io, userId).catch(() => {});
  });
}
