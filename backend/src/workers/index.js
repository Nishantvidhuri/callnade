import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { connectDb } from '../config/db.js';
import { processImage } from './processors/image.processor.js';
import { recomputePopularity } from './processors/popularity.processor.js';
import { sendNotification } from './processors/notification.processor.js';

const connection = { url: env.REDIS_URL };

async function main() {
  await connectDb();

  const workers = [
    new Worker('image-processing', processImage, { connection, concurrency: 4 }),
    new Worker('popularity-recompute', recomputePopularity, { connection, concurrency: 1 }),
    new Worker('notification', sendNotification, { connection, concurrency: 8 }),
  ];

  for (const w of workers) {
    w.on('failed', (job, err) =>
      logger.error({ err, queue: w.name, jobId: job?.id }, 'job failed'),
    );
    w.on('completed', (job) => logger.info({ queue: w.name, jobId: job.id }, 'job done'));
  }

  logger.info('workers started');

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
