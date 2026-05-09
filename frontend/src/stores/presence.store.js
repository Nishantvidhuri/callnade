import { create } from 'zustand';

/**
 * Live presence cache. Maps userId → 'online' | 'busy' | 'offline'.
 *
 * Two write paths feed it:
 *   1. Initial render — UserCard / Profile call `seed(userId, status)`
 *      with the value baked into the API payload. Acts as a fallback
 *      so the dot renders correctly on first paint, before any socket
 *      events arrive.
 *   2. Real-time updates — usePresenceSync listens to `presence:update`
 *      socket events and writes the latest status here.
 *
 * Using a plain object (not a Map) so Zustand's shallow-equality
 * subscriber comparisons can detect changes per-key cheaply with the
 * `useStatus(userId)` selector.
 */
export const usePresenceStore = create((set, get) => ({
  byId: {},

  // Read helper — components call this directly via the selector
  // pattern (see PresenceDot). Falls back to whatever was passed in.
  get: (userId, fallback = 'offline') =>
    get().byId[String(userId)] ?? fallback,

  // Apply a real-time update from the socket. Skips identity writes so
  // we don't churn unrelated subscribers.
  apply: ({ userId, status }) =>
    set((s) => {
      const id = String(userId);
      if (s.byId[id] === status) return s;
      return { byId: { ...s.byId, [id]: status } };
    }),

  // Seed from API responses. Same shape as apply but exposed
  // separately so usage sites read clearly.
  seed: (userId, status) => {
    if (!userId || !status) return;
    set((s) => {
      const id = String(userId);
      if (s.byId[id] === status) return s;
      return { byId: { ...s.byId, [id]: status } };
    });
  },

  clear: () => set({ byId: {} }),
}));
