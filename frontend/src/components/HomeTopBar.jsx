import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Search, X, Settings as SettingsIcon, Wallet } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';
import NotificationDropdown from './NotificationDropdown.jsx';

export default function HomeTopBar({ query, onQueryChange }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const me = useAuthStore((s) => s.user);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { if (query) setOpen(true); }, [query]);

  const toggle = () => {
    if (open) {
      onQueryChange('');
      setOpen(false);
    } else {
      setOpen(true);
    }
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3 mb-5 sm:mb-7">
      {/* Mobile-only brand wordmark. Hidden on lg+ where the sidebar shows it. */}
      <Link
        to="/"
        className="lg:hidden font-logo text-2xl leading-none text-tinder tracking-wide shrink-0 mr-auto"
      >
        callnade
      </Link>

      <div className="hidden lg:block flex-1" />

      {open && (
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onBlur={() => { if (!query) setOpen(false); }}
          placeholder="Search people"
          className="w-44 sm:w-64 lg:w-80 px-4 py-2.5 text-sm rounded-full bg-white/80 backdrop-blur-md border border-white/80 focus:outline-none focus:bg-white focus:border-brand-300 focus:ring-4 focus:ring-brand-100 transition shrink"
        />
      )}

      <CircleBtn onClick={toggle} ariaLabel={open ? 'Close search' : 'Search'}>
        {open ? <X size={18} strokeWidth={1.8} /> : <Search size={18} strokeWidth={1.8} />}
      </CircleBtn>

      {!open && me && (() => {
        const isProvider = me.role === 'provider';
        const value = isProvider ? (me.earningsBalance ?? 0) : (me.walletBalance ?? 0);
        // Earnings pill is amber to differentiate from the green wallet pill.
        const cls = isProvider
          ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100';
        return (
          <Link
            to="/billing"
            title={`${fmtCredits(value)} ${isProvider ? 'earnings' : 'credits'} — open billing`}
            className={`hidden sm:inline-flex items-center gap-1.5 h-10 sm:h-11 px-3 rounded-full border text-sm font-bold tabular-nums shadow-sm transition shrink-0 ${cls}`}
          >
            <Wallet size={14} strokeWidth={2.2} />
            {fmtCredits(value)}
          </Link>
        );
      })()}

      {me ? (
        <>
          <NotificationDropdown />

          <CircleBtn to="/settings" ariaLabel="Settings">
            <SettingsIcon size={18} strokeWidth={1.8} />
          </CircleBtn>
        </>
      ) : (
        !open && (
          <>
            <Link
              to="/login"
              className="px-4 sm:px-5 h-10 sm:h-11 inline-flex items-center text-sm font-semibold rounded-full bg-white/80 backdrop-blur-md border border-white/80 text-ink hover:bg-white shadow-sm transition shrink-0"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="px-4 sm:px-5 h-10 sm:h-11 inline-flex items-center text-sm font-semibold rounded-full bg-tinder text-white shadow-tinder hover:brightness-110 transition shrink-0"
            >
              Sign up
            </Link>
          </>
        )
      )}
    </div>
  );
}

function CircleBtn({ children, onClick, to, ariaLabel }) {
  const cls =
    'w-10 h-10 sm:w-11 sm:h-11 rounded-full grid place-items-center bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white hover:text-ink shadow-sm transition shrink-0';
  if (to) {
    return (
      <Link to={to} aria-label={ariaLabel} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} aria-label={ariaLabel} className={cls}>
      {children}
    </button>
  );
}
