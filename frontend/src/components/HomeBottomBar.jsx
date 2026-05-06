import { NavLink } from 'react-router-dom';
import {
  Home as HomeIcon,
  Video,
  Bell,
  User as UserIcon,
} from 'lucide-react';
import { useIncomingCallsStore } from '../stores/incomingCalls.store.js';
import { useNotificationStore } from '../stores/notification.store.js';
import { useAuthStore } from '../stores/auth.store.js';

/**
 * Mobile/tablet bottom nav. Mirrors the sidebar's primary destinations.
 * Hidden on desktop (lg+) where the left sidebar takes over.
 *
 * Order: Home · Calls · Alerts · Profile.
 */
export default function HomeBottomBar() {
  const me = useAuthStore((s) => s.user);
  const ringingCount = useIncomingCallsStore((s) => s.items.length);
  const notifUnread = useNotificationStore((s) => s.unread);

  // Visitors don't get the bottom nav — they see the public top bar instead.
  if (!me) return null;

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200 shadow-[0_-4px_18px_-12px_rgba(0,0,0,0.18)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-4 items-end h-[64px] px-2 max-w-md mx-auto">
        <Tab to="/" icon={HomeIcon} label="Home" end />
        <Tab to="/calls" icon={Video} label="Calls" badge={ringingCount} />
        <Tab to="/notifications" icon={Bell} label="Alerts" badge={notifUnread} />
        <Tab to={`/u/${me.username}`} icon={UserIcon} label="Profile" />
      </div>
    </nav>
  );
}

function Tab({ to, icon: Icon, label, badge, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex flex-col items-center justify-center gap-0.5 h-full transition ${
          isActive ? 'text-brand-600' : 'text-neutral-500 hover:text-ink'
        }`
      }
    >
      <span className="relative">
        <Icon size={21} strokeWidth={1.8} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 grid place-items-center text-[9px] font-bold rounded-full bg-tinder text-white border border-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
