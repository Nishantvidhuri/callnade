import { create } from 'zustand';

/**
 * Live ring queue. Populated by useIncomingCalls listening to the
 * socket; rendered on the Calls tab. Mirrors the web store 1:1 so
 * the Accept / Reject UX, dedupe rules, and clear-on-logout
 * behaviour all match.
 *
 *   items[]:  { callId, from: { id, username, displayName? }, packageId?,
 *              perMinuteRate?, earnRate?, callerBalance?, callType, at }
 */
export const useIncomingCallsStore = create((set) => ({
  items: [],
  add: (call) =>
    set((s) => {
      // Dedupe by callId + caller. A re-dial from the same person
      // replaces the previous entry so the list shows one row per
      // caller, always the freshest invite.
      const fromId = call.from?.id ? String(call.from.id) : null;
      const filtered = s.items.filter((i) => {
        if (i.callId === call.callId) return false;
        if (fromId && String(i.from?.id) === fromId) return false;
        return true;
      });
      return {
        items: [
          { ...call, at: call.at || new Date().toISOString() },
          ...filtered,
        ],
      };
    }),
  remove: (callId) =>
    set((s) => ({ items: s.items.filter((i) => i.callId !== callId) })),
  clear: () => set({ items: [] }),
}));
