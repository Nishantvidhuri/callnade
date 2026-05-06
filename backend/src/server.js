import { createServer } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { logger } from './config/logger.js';
import { disconnectRedis } from './config/redis.js';
import { closeQueues } from './queues/queues.js';
import { scheduleRecurring } from './queues/schedule.js';
import { attachSocketServer } from './realtime/socket.js';

async function start() {
  await connectDb();
  await scheduleRecurring();

  const httpServer = createServer(app);
  attachSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`API + socket listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    httpServer.close(async () => {
      await closeQueues().catch(() => {});
      await disconnectRedis().catch(() => {});
      await disconnectDb().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
