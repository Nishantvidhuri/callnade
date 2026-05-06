import { Queue, QueueEvents } from 'bullmq';
import { env } from '../config/env.js';

const connection = { url: env.REDIS_URL };

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 1000, age: 3600 },
  removeOnFail: { count: 500 },
};

export const imageQueue = new Queue('image-processing', {
  connection,
  defaultJobOptions: defaultJobOpts,
});

export const notificationQueue = new Queue('notification', {
  connection,
  defaultJobOptions: defaultJobOpts,
});

export const popularityQueue = new Queue('popularity-recompute', {
  connection,
  defaultJobOptions: { ...defaultJobOpts, attempts: 1 },
});

export const queueEvents = {
  image: new QueueEvents('image-processing', { connection }),
};

export async function closeQueues() {
  await Promise.all([
    imageQueue.close(),
    notificationQueue.close(),
    popularityQueue.close(),
    queueEvents.image.close(),
  ]);
}
