import { Link, NavLink } from 'react-router-dom';
import {
  Home as HomeIcon,
  BellRing,
  Video,
  Shield,
  User as UserIcon,
  LogOut,
  Wallet,
} from 'lucide-react';
import { useIncomingCallsStore } from '../stores/incomingCalls.store.js';
import { fmtCredits } from '../utils/formatCredits.js';

export default function HomeSidebar({ me, onLogout }) {
  const ringingCount = useIncomingCallsStore((s) => s.items.length);

  return (
    <aside className="hidden lg:flex flex-col w-[240px] shrink-0 bg-tinder text-white">
      <div className="px-5 pt-6 pb-4">
        <Link to="/" className="block">
          <span className="font-logo text-[2rem] leading-none text-white tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
            callnade
          </span>
        </Link>
      </div>

      <nav className="flex flex-col gap-1 px-3 flex-1">
        <SidebarLink to="/" icon={HomeIcon} end>Home</SidebarLink>
        {/* Video calls inbox is for creators only — that's where ringing
            calls land. Subscribers initiate from a creator's profile;
            admins use /admin/calls/active for moderation. */}
        {me?.role === 'provider' && (
          <SidebarLink to="/calls" icon={Video} badge={ringingCount}>Video calls</SidebarLink>
        )}
        {/* "Subscribers" tab is the incoming-follower-requests view —
            creators only. */}
        {me?.role === 'provider' && (
          <SidebarLink to="/requests" icon={BellRing}>Subscribers</SidebarLink>
        )}
        {me && <SidebarLink to={`/u/${me.username}`} icon={UserIcon}>Profile</SidebarLink>}
        {(me?.role === 'admin' || me?.isAdmin) && <SidebarLink to="/admin" icon={Shield}>Admin</SidebarLink>}
      </nav>

      <div className="p-3 border-t border-white/15 space-y-2">
        {me && (
          <>
            <div className="flex items-center justify-between px-1 text-white">
              <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide opacity-80">
                <Wallet size={13} strokeWidth={2} />
                {me.role === 'provider' ? 'Earnings' : 'Wallet'}
              </span>
              <span className="text-sm font-bold tabular-nums">
                {fmtCredits(me.role === 'provider' ? me.earningsBalance : me.walletBalance)}{' '}
                <span className="text-[10px] opacity-70 font-medium">credits</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 p-2 bg-white/15 rounded-xl">
              <Link to={`/u/${me.username}`} className="flex items-center gap-2.5 min-w-0 flex-1">
                {me.avatarUrl ? (
                  <img src={me.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-white grid place-items-center text-brand-600 text-sm font-semibold">
                    {(me.displayName || me.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{me.displayName || me.username}</p>
                  <p className="text-xs text-white/75 truncate">@{me.username}</p>
                </div>
              </Link>
              <button
                onClick={onLogout}
                aria-label="Log out"
                className="w-8 h-8 grid place-items-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition shrink-0"
              >
                <LogOut size={15} strokeWidth={1.8} />
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function SidebarLink({ to, icon: Icon, children, end, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
          isActive
            ? 'bg-white text-brand-600 font-semibold shadow-md shadow-black/10'
            : 'text-white/85 hover:bg-white/15 hover:text-white'
        }`
      }
    >
      <Icon size={17} strokeWidth={1.8} />
      <span className="flex-1">{children}</span>
      {badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 grid place-items-center text-[10px] font-bold rounded-full bg-white text-brand-600">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  );
}
