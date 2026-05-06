import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { router as apiRouter } from './routes/index.js';
import { generalLimiter } from './middleware/rateLimiters.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
const TUNNEL_HOST_RE = /(?:^|\.)(ngrok-free\.app|ngrok\.app|ngrok\.io|trycloudflare\.com|loca\.lt)$/i;
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      try {
        const host = new URL(origin).hostname;
        if (allowedOrigins.includes(origin) || TUNNEL_HOST_RE.test(host)) {
          return cb(null, true);
        }
      } catch {}
      cb(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/v1', generalLimiter, apiRouter);

app.use((req, res) => {
  res.status(404).json({ error: { message: `Not found: ${req.method} ${req.originalUrl}` } });
});

app.use(errorHandler);
