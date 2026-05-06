import { create } from 'zustand';

export const useLoginPromptStore = create((set) => ({
  open: false,
  message: 'Log in or sign up to chat with them',
  show: (message) => set({ open: true, message: message || 'Log in or sign up to chat with them' }),
  hide: () => set({ open: false }),
}));
