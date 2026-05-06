import { create } from 'zustand';

export const useNotificationStore = create((set) => ({
  items: [],
  unread: 0,
  setItems: (items) => set({ items, unread: items.length }),
  prepend: (item) =>
    set((s) => {
      if (s.items.some((i) => i.id === item.id)) return s;
      return { items: [item, ...s.items], unread: s.unread + 1 };
    }),
  remove: (id) =>
    set((s) => {
      const filtered = s.items.filter((i) => i.id !== id);
      const removed = s.items.length - filtered.length;
      return { items: filtered, unread: Math.max(0, s.unread - removed) };
    }),
  markAllRead: () => set((s) => ({ unread: 0 })),
  clear: () => set({ items: [], unread: 0 }),
}));
