import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPub, redisSub } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { verifyAccess } from '../utils/jwt.js';
import { User } from '../models/user.model.js';
import { registerCallHandlers } from './handlers/call.handlers.js';
import { registerPresenceHandlers } from './handlers/presence.handlers.js';
import { registerChatHandlers } from './handlers/chat.handlers.js';

export function attachSocketServer(httpServer) {
  const TUNNEL_HOST_RE = /(?:^|\.)(ngrok-free\.app|ngrok\.app|ngrok\.io|trycloudflare\.com|loca\.lt)$/i;
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const allowed = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
        try {
          const host = new URL(origin).hostname;
          if (allowed.includes(origin) || TUNNEL_HOST_RE.test(host)) return cb(null, true);
        } catch {}
        cb(new Error('CORS: origin not allowed'));
      },
      credentials: true,
    },
    path: '/socket.io',
  });

  io.adapter(createAdapter(redisPub, redisSub));

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
      const payload = verifyAccess(token);
      // Look up isAdmin/role once per socket so privileged events
      // (admin spectator, etc.) can authorize cheaply without a DB hit
      // per emit.
      const u = await User.findById(payload.sub).select('role isAdmin').lean();
      socket.user = {
        id: payload.sub,
        username: payload.username,
        role: u?.role || 'user',
        isAdmin: !!u?.isAdmin || u?.role === 'admin',
      };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
    logger.debug({ userId: socket.user.id }, 'socket connected');
    registerPresenceHandlers(io, socket);
    registerCallHandlers(io, socket);
    registerChatHandlers(io, socket);
  });

  return io;
}
