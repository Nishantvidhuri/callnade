import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';
import { api } from '../services/api.js';
import { useChatStore } from '../stores/chat.store.js';
import ChatPanel from './ChatPanel.jsx';

export default function ChatView() {
  const activePeer = useChatStore((s) => s.activePeer);
  const setActivePeer = useChatStore((s) => s.setActivePeer);
  const unread = useChatStore((s) => s.unread);

  const [mutuals, setMutuals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  const load = () => {
    api
      .get('/users/me/mutuals')
      .then((r) => setMutuals(r.data.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 30_000);
    return () => {
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mutuals;
    return mutuals.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q),
    );
  }, [mutuals, query]);

  const onlineCount = mutuals.filter((u) => u.online).length;
  const activePeerOnline = mutuals.find((u) => String(u.id) === String(activePeer?.id))?.online;

  return (
    <div className="h-full flex bg-white">
      {/* Conversation list */}
      <aside
        className={`w-full lg:w-[340px] lg:shrink-0 lg:border-r border-neutral-200 flex flex-col ${
          activePeer ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="px-5 pt-5 pb-3 border-b border-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-xl">Messages</h2>
            {onlineCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {onlineCount} online
              </span>
            )}
          </div>
          <div className="relative">
            <Search
              size={15}
              strokeWidth={1.8}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-full bg-neutral-100 border border-transparent focus:outline-none focus:bg-white focus:border-brand-300 focus:ring-2 focus:ring-brand-100 transition"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-5 text-sm text-neutral-400">Loading…</p>}
          {error && <p className="p-5 text-sm text-rose-600">{error}</p>}
          {!loading && !mutuals.length && !error && (
            <div className="p-8 text-center text-sm text-neutral-500">
              <p className="font-medium mb-1 text-ink">No connections yet</p>
              <p>Match with someone to start chatting.</p>
            </div>
          )}
          {!loading && mutuals.length > 0 && filtered.length === 0 && (
            <p className="p-5 text-sm text-neutral-400 text-center">No matches</p>
          )}
          <ul>
            {filtered.map((u) => {
              const isActive = String(activePeer?.id) === String(u.id);
              const n = unread[String(u.id)] || 0;
              return (
                <li key={u.id}>
                  <button
                    onClick={() => setActivePeer(u)}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition border-l-2 ${
                      isActive
                        ? 'bg-brand-50 border-brand-500'
                        : 'border-transparent hover:bg-neutral-50'
                    }`}
                  >
                    <Avatar user={u} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{u.displayName || u.username}</p>
                      <p className="text-xs text-neutral-500 truncate">
                        {u.online ? <span className="text-emerald-600">Online</span> : `@${u.username}`}
                      </p>
                    </div>
                    {n > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 grid place-items-center text-[10px] font-semibold text-white bg-tinder rounded-full">
                        {n > 9 ? '9+' : n}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Conversation panel */}
      <section className={`flex-1 min-w-0 ${activePeer ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>
        {activePeer ? (
          <ChatPanel
            peer={{ ...activePeer, online: activePeerOnline ?? activePeer.online }}
            onBack={() => setActivePeer(null)}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-center px-6 bg-neutral-50">
            <div>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-100 grid place-items-center text-brand-500">
                <MessageSquare size={26} strokeWidth={1.8} />
              </div>
              <p className="font-semibold">Pick a conversation</p>
              <p className="text-sm text-neutral-500 mt-1">
                Select someone on the left to start chatting.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Avatar({ user }) {
  return (
    <div className="relative shrink-0">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-tinder grid place-items-center text-white text-sm font-medium">
          {(user.displayName || user.username).charAt(0).toUpperCase()}
        </div>
      )}
      {user.online && (
        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
      )}
    </div>
  );
}
