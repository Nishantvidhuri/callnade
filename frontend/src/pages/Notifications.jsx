import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Check, Sparkles, UserPlus } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { useNotificationStore } from '../stores/notification.store.js';
import { disconnectSocket } from '../services/socket.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';

export default function Notifications() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();
  const items = useNotificationStore((s) => s.items);
  const remove = useNotificationStore((s) => s.remove);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  // Mark all as read when the page is opened.
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const respond = async (notif, action) => {
    try {
      await api.post(`/follow/respond/${notif.requestId}`, { action });
    } catch {
      /* swallow */
    }
    remove(notif.id);
  };

  const onLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    useAuthStore.getState().clear();
    disconnectSocket();
    nav('/login', { replace: true });
  };

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-neutral-950 text-ink">
      <HomeSidebar me={me} onLogout={onLogout} />

      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#fff5f9]">
        <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav(-1)}
              className="lg:hidden w-9 h-9 grid place-items-center rounded-full bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white"
              aria-label="Back"
            >
              <ArrowLeft size={18} strokeWidth={1.8} />
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
                <Bell size={22} className="text-brand-500" /> Notifications
              </h1>
              <p className="text-sm text-neutral-500 mt-0.5">
                {items.length === 0
                  ? "You're all caught up"
                  : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-24 lg:pb-8">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden max-w-2xl">
              {items.map((n) => (
                <li key={n.id} className="flex items-start gap-3 p-4 hover:bg-neutral-50">
                  <Avatar user={n.from} type={n.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <Link
                        to={n.from?.username ? `/u/${n.from.username}` : '#'}
                        className="font-semibold hover:underline"
                      >
                        {n.from?.displayName || n.from?.username}
                      </Link>{' '}
                      <span className="text-neutral-600">{messageFor(n)}</span>
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{relTime(n.createdAt)}</p>

                    {n.type === 'follow_request' && (
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={() => respond(n, 'accept')}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-full text-white bg-tinder hover:brightness-110 transition inline-flex items-center gap-1.5"
                        >
                          <Check size={12} strokeWidth={3} /> Accept
                        </button>
                        <button
                          onClick={() => respond(n, 'reject')}
                          className="px-3.5 py-1.5 text-xs font-medium rounded-full border border-neutral-200 hover:bg-neutral-50 transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <HomeBottomBar />
    </div>
  );
}

function Avatar({ user, type }) {
  const fallbackIcon = type === 'follow_accepted' ? <Sparkles size={14} /> : <UserPlus size={14} />;
  return (
    <div className="relative shrink-0">
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
      ) : (
        <div className="w-11 h-11 rounded-full bg-tinder grid place-items-center text-white text-sm font-semibold">
          {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
        </div>
      )}
      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-neutral-200 grid place-items-center text-brand-500">
        {fallbackIcon}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-100 grid place-items-center text-brand-500">
        <Bell size={26} strokeWidth={1.8} />
      </div>
      <p className="font-semibold">No notifications yet</p>
      <p className="text-sm text-neutral-500 mt-1 max-w-xs mx-auto">
        Subscription requests and platform updates will show up here.
      </p>
    </div>
  );
}

function messageFor(n) {
  if (n.type === 'follow_request') return 'wants to subscribe to you.';
  if (n.type === 'follow_accepted') return 'accepted your subscription.';
  if (n.type === 'new_follower') return 'subscribed to you.';
  return '';
}

function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
