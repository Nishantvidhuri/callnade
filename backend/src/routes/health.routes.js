import { Router } from 'express';
import mongoose from 'mongoose';

export const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'up' : 'down',
    uptime: process.uptime(),
  });
});
