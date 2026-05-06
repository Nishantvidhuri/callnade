import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../services/api.js';
import { useChatStore } from '../stores/chat.store.js';
import ChatPanel from './ChatPanel.jsx';

export default function ChatDrawer() {
  const open = useChatStore((s) => s.drawerOpen);
  const setDrawerOpen = useChatStore((s) => s.setDrawerOpen);
  const activePeer = useChatStore((s) => s.activePeer);
  const setActivePeer = useChatStore((s) => s.setActivePeer);
  const unread = useChatStore((s) => s.unread);

  const [mutuals, setMutuals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get('/users/me/mutuals')
      .then((r) => setMutuals(r.data.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setDrawerOpen(false)} />
      <aside className="fixed right-0 top-0 h-[100dvh] w-full sm:w-[380px] bg-white sm:border-l border-neutral-200 z-50 flex flex-col animate-[slide_180ms_ease-out]">
        {!activePeer ? (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <p className="font-semibold">Messages</p>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="w-8 h-8 grid place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-ink transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && <p className="p-5 text-sm text-neutral-400">Loading…</p>}
              {error && <p className="p-5 text-sm text-rose-600">{error}</p>}
              {!loading && !mutuals.length && (
                <div className="p-8 text-center text-sm text-neutral-500">
                  <p className="font-medium mb-1 text-ink">No connections yet</p>
                  <p>Chat opens up once a follow request is mutual.</p>
                </div>
              )}
              <ul>
                {mutuals.map((u) => {
                  const n = unread[String(u.id)] || 0;
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => setActivePeer(u)}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 text-left"
                      >
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-neutral-200 grid place-items-center text-sm font-medium text-neutral-600">
                            {(u.displayName || u.username).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{u.displayName || u.username}</p>
                          <p className="text-xs text-neutral-500 truncate">@{u.username}</p>
                        </div>
                        {n > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 grid place-items-center text-[10px] font-medium text-white bg-ink rounded-full">
                            {n > 9 ? '9+' : n}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : (
          <ChatPanel peer={activePeer} onBack={() => setActivePeer(null)} />
        )}
      </aside>

      <style>{`@keyframes slide{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </>
  );
}
