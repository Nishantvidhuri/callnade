import { create } from 'zustand';

export const useChatStore = create((set) => ({
  conversations: {},
  unread: {},
  totalUnread: 0,
  activePeer: null,
  drawerOpen: false,

  setDrawerOpen: (open) => set((s) => ({ drawerOpen: open, activePeer: open ? s.activePeer : null })),
  openChatWith: (peer) =>
    set((s) => {
      const id = String(peer.id);
      const wasUnread = s.unread[id] || 0;
      const unread = { ...s.unread };
      delete unread[id];
      return {
        drawerOpen: true,
        activePeer: peer,
        unread,
        totalUnread: Math.max(0, s.totalUnread - wasUnread),
      };
    }),
  setActivePeer: (peer) =>
    set((s) => {
      if (!peer) return { activePeer: null };
      const id = String(peer.id);
      const wasUnread = s.unread[id] || 0;
      const unread = { ...s.unread };
      delete unread[id];
      return {
        activePeer: peer,
        unread,
        totalUnread: Math.max(0, s.totalUnread - wasUnread),
      };
    }),
  addMessage: (peerId, msg, { incoming = false } = {}) =>
    set((s) => {
      const list = s.conversations[peerId] || [];
      const isActive = String(s.activePeer?.id) === String(peerId) && s.drawerOpen;
      const incBy = incoming && !isActive ? 1 : 0;
      return {
        conversations: { ...s.conversations, [peerId]: [...list, msg] },
        unread: incBy ? { ...s.unread, [peerId]: (s.unread[peerId] || 0) + 1 } : s.unread,
        totalUnread: s.totalUnread + incBy,
      };
    }),
}));
