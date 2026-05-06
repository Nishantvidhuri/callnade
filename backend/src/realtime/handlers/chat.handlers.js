import { canMessage } from '../../services/follow.service.js';

const userRoom = (userId) => `user:${userId}`;

export function registerChatHandlers(io, socket) {
  socket.on('chat:send', async ({ toUserId, text }, ack) => {
    if (!toUserId || typeof text !== 'string') return ack?.({ error: 'invalid' });
    const trimmed = text.trim().slice(0, 1000);
    if (!trimmed) return ack?.({ error: 'empty' });

    const allowed = await canMessage(socket.user.id, toUserId);
    if (!allowed) return ack?.({ error: 'Not subscribed' });

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: { id: socket.user.id, username: socket.user.username },
      to: String(toUserId),
      text: trimmed,
      at: new Date().toISOString(),
    };

    io.to(userRoom(toUserId)).emit('chat:message', message);
    socket.emit('chat:message', message);
    ack?.({ ok: true, message });
  });

  socket.on('chat:typing', ({ toUserId }) => {
    if (!toUserId) return;
    io.to(userRoom(toUserId)).emit('chat:typing', { from: socket.user.id });
  });
}
