let io = null;

export function setIO(instance) {
  io = instance;
}

export function getIO() {
  return io;
}

export function notifyUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${String(userId)}`).emit(event, payload);
}
