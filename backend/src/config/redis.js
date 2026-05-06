import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

const baseOpts = { maxRetriesPerRequest: null, enableReadyCheck: true };

export const redis = new Redis(env.REDIS_URL, baseOpts);
export const redisSub = new Redis(env.REDIS_URL, baseOpts);
export const redisPub = new Redis(env.REDIS_URL, baseOpts);

for (const [name, client] of [
  ['redis', redis],
  ['redis:sub', redisSub],
  ['redis:pub', redisPub],
]) {
  client.on('error', (err) => logger.error({ err, name }, 'redis error'));
}

export async function disconnectRedis() {
  await Promise.all([redis.quit(), redisSub.quit(), redisPub.quit()]);
}
