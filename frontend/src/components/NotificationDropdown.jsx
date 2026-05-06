import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Sparkles, UserPlus, Check, X as XIcon } from 'lucide-react';
import { api } from '../services/api.js';
import { useNotificationStore } from '../stores/notification.store.js';

export default function NotificationDropdown() {
  const items = useNotificationStore((s) => s.items);
  const unread = useNotificationStore((s) => s.unread);
  const remove = useNotificationStore((s) => s.remove);
  const markAllRead = useNotificationStore((s) => s.markAllRead);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (open) markAllRead();
  }, [open, markAllRead]);

  const respond = async (notif, action) => {
    try {
      await api.post(`/follow/respond/${notif.requestId}`, { action });
    } catch {
      /* swallow */
    }
    remove(notif.id);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full grid place-items-center bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white hover:text-ink shadow-sm transition shrink-0"
      >
        <Bell size={18} strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center text-[10px] font-bold text-white bg-tinder rounded-full">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-white border border-neutral-200 rounded-2xl shadow-xl shadow-pink-200/40 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
            <p className="font-semibold text-sm">Notifications</p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="w-7 h-7 grid place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100"
            >
              <XIcon size={15} />
            </button>
          </div>

          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-neutral-500">
                No notifications yet
              </li>
            ) : (
              items.map((n) => (
                <li
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0 border-neutral-100 hover:bg-neutral-50"
                >
                  <Avatar user={n.from} type={n.type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <Link
                        to={`/u/${n.from?.username}`}
                        className="font-semibold hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        {n.from?.displayName || n.from?.username}
                      </Link>{' '}
                      <span className="text-neutral-600">{messageFor(n)}</span>
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{relTime(n.createdAt)}</p>

                    {n.type === 'follow_request' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => respond(n, 'accept')}
                          className="px-3 py-1 text-xs font-semibold rounded-full text-white bg-tinder hover:brightness-110 transition inline-flex items-center gap-1"
                        >
                          <Check size={12} strokeWidth={3} /> Accept
                        </button>
                        <button
                          onClick={() => respond(n, 'reject')}
                          className="px-3 py-1 text-xs font-medium rounded-full border border-neutral-200 hover:bg-neutral-50 transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Avatar({ user, type }) {
  const fallbackIcon = type === 'follow_accepted' ? <Sparkles size={14} /> : <UserPlus size={14} />;
  return (
    <div className="relative shrink-0">
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-tinder grid place-items-center text-white text-sm font-semibold">
          {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
        </div>
      )}
      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-neutral-200 grid place-items-center text-brand-500">
        {fallbackIcon}
      </span>
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
