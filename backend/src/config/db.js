import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDb() {
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 50,
  });
  logger.info('mongo connected');
}

export async function disconnectDb() {
  await mongoose.disconnect();
  logger.info('mongo disconnected');
}
