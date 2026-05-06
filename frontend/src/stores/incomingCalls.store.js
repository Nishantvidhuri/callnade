import { create } from 'zustand';

export const useIncomingCallsStore = create((set) => ({
  items: [], // { callId, from: { id, username }, at }
  add: (call) =>
    set((s) => {
      // Dedupe by both callId AND caller user — if the same person rings
      // again (e.g. they hung up and re-dialed), the new call REPLACES the
      // old entry instead of stacking. This keeps the Video Calls page
      // showing one row per caller, always with the most recent live call.
      const fromId = call.from?.id ? String(call.from.id) : null;
      const filtered = s.items.filter((i) => {
        if (i.callId === call.callId) return false;
        if (fromId && String(i.from?.id) === fromId) return false;
        return true;
      });
      return { items: [{ ...call, at: call.at || new Date().toISOString() }, ...filtered] };
    }),
  remove: (callId) =>
    set((s) => ({ items: s.items.filter((i) => i.callId !== callId) })),
  clear: () => set({ items: [] }),
}));
