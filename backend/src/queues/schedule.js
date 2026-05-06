import { popularityQueue } from './queues.js';

export async function scheduleRecurring() {
  await popularityQueue.add(
    'recompute',
    {},
    {
      repeat: { pattern: '*/10 * * * *' },
      jobId: 'popularity-recompute',
    },
  );
}
