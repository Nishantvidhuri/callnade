import { useLocation } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useChatStore } from '../stores/chat.store.js';

export default function ChatFab() {
  const totalUnread = useChatStore((s) => s.totalUnread);
  const open = useChatStore((s) => s.drawerOpen);
  const setDrawerOpen = useChatStore((s) => s.setDrawerOpen);
  const loc = useLocation();

  if (open || loc.pathname === '/chat') return null;

  return (
    <button
      onClick={() => setDrawerOpen(true)}
      aria-label="Open messages"
      className="hidden lg:grid fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-tinder text-white shadow-tinder hover:brightness-110 active:scale-95 transition place-items-center"
    >
      <MessageSquare size={20} strokeWidth={2} />
      {totalUnread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 grid place-items-center text-[10px] font-bold text-brand-600 bg-white border border-neutral-200 rounded-full">
          {totalUnread > 9 ? '9+' : totalUnread}
        </span>
      )}
    </button>
  );
}
