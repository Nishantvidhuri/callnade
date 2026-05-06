import { Link, useNavigate } from 'react-router-dom';
import { Search, Settings as SettingsIcon } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import NotificationDropdown from './NotificationDropdown.jsx';

/**
 * Persistent top bar that appears on every non-chromeless route in
 * mobile/tablet view. Hidden on desktop (lg+) where the left sidebar
 * already provides the brand + nav.
 *
 * Layout: callnade wordmark · search · notification bell · settings gear.
 * The search icon always navigates to "/" — the home page is the only
 * surface that knows how to filter creators, so we route there from any
 * other page.
 */
export default function MobileTopBar() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();

  return (
    <div className="lg:hidden bg-[#fff5f9]/85 backdrop-blur-md border-b border-rose-100 shrink-0">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Link
          to="/"
          aria-label="callnade home"
          className="font-logo text-2xl leading-none text-tinder tracking-wide shrink-0 mr-auto"
        >
          callnade
        </Link>

        <button
          type="button"
          onClick={() => nav('/')}
          aria-label="Search"
          className="w-10 h-10 rounded-full grid place-items-center bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white hover:text-ink shadow-sm transition shrink-0"
        >
          <Search size={18} strokeWidth={1.8} />
        </button>

        {me && <NotificationDropdown />}

        {me && (
          <Link
            to="/settings"
            aria-label="Settings"
            className="w-10 h-10 rounded-full grid place-items-center bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white hover:text-ink shadow-sm transition shrink-0"
          >
            <SettingsIcon size={18} strokeWidth={1.8} />
          </Link>
        )}
      </div>
    </div>
  );
}
