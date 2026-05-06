import { redis } from '../../config/redis.js';

const PRESENCE_TTL = 60;

export function registerPresenceHandlers(_io, socket) {
  const key = `presence:${socket.user.id}`;
  redis.set(key, '1', 'EX', PRESENCE_TTL);
  const ping = setInterval(() => redis.expire(key, PRESENCE_TTL), 30_000);

  socket.on('disconnect', () => {
    clearInterval(ping);
    redis.del(key);
  });
}
