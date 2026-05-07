import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, X, Wallet } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';

/**
 * Persistent top bar that appears on every non-chromeless route in
 * mobile/tablet view. Hidden on desktop (lg+) where the left sidebar
 * already provides the brand + nav.
 *
 * Two layouts:
 *   - default: callnade wordmark · wallet pill (or login pills) · search
 *   - search expanded: ← back · text input
 *
 * Typing in the search input replaces the URL with `/?q=<text>` so the
 * Home grid (which reads `?q=` from the URL) updates live, regardless
 * of what page you started typing from.
 */
export default function MobileTopBar() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();
  const loc = useLocation();

  // If the user landed here with a `?q=` already in the URL (deep link
  // from elsewhere), surface it inside the input so they can edit it.
  const initialQuery = (() => {
    try { return new URLSearchParams(loc.search).get('q') || ''; }
    catch { return ''; }
  })();

  const [searchOpen, setSearchOpen] = useState(!!initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef(null);

  // Auto-focus when the user expands search.
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // Keep the input in sync if the URL changes from elsewhere (e.g. user
  // navigates to a fresh /).
  useEffect(() => {
    const next = (() => {
      try { return new URLSearchParams(loc.search).get('q') || ''; }
      catch { return ''; }
    })();
    if (next !== query) setQuery(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.search]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    const trimmed = v.trim();
    // Always route to `/` so the Home grid actually picks the query up
    // — typing on /notifications shouldn't search inside notifications.
    if (trimmed) {
      nav(`/?q=${encodeURIComponent(trimmed)}`, { replace: true });
    } else if (loc.pathname === '/') {
      // Clear query string but stay on home.
      nav('/', { replace: true });
    }
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
    // If we're on home with a stale ?q=, drop it too.
    if (loc.pathname === '/' && loc.search) nav('/', { replace: true });
  };

  // Wallet pill values — providers see earnings (amber), everyone else
  // sees wallet credits (emerald). Mirrors the desktop HomeTopBar.
  const isProvider = me?.role === 'provider';
  const walletValue = isProvider ? (me?.earningsBalance ?? 0) : (me?.walletBalance ?? 0);
  const walletCls = isProvider
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700';

  return (
    <div className="lg:hidden bg-[#fff5f9]/85 backdrop-blur-md border-b border-rose-100 shrink-0">
      <div className="flex items-center gap-2 px-4 py-2.5">
        {searchOpen ? (
          <>
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              className="w-10 h-10 rounded-full grid place-items-center bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white hover:text-ink shadow-sm transition shrink-0"
            >
              <X size={18} strokeWidth={1.8} />
            </button>
            <input
              ref={inputRef}
              value={query}
              onChange={onSearchChange}
              placeholder="Search people"
              className="flex-1 px-4 py-2.5 text-sm rounded-full bg-white border border-white focus:outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-100 transition"
            />
          </>
        ) : (
          <>
            <Link
              to="/"
              aria-label="callnade home"
              className="font-logo text-2xl leading-none text-tinder tracking-wide shrink-0 mr-auto"
            >
              callnade
            </Link>

            {me && (
              <Link
                to="/billing"
                title={`${fmtCredits(walletValue)} ${isProvider ? 'earnings' : 'credits'} — open billing`}
                className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-full border text-xs font-bold tabular-nums shadow-sm transition shrink-0 ${walletCls}`}
              >
                <Wallet size={13} strokeWidth={2.2} />
                {fmtCredits(walletValue)}
              </Link>
            )}

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="w-10 h-10 rounded-full grid place-items-center bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white hover:text-ink shadow-sm transition shrink-0"
            >
              <Search size={18} strokeWidth={1.8} />
            </button>

            {!me && (
              // Anonymous visitors get login pills next to the search
              // button — keeps the auth path one tap from anywhere.
              <>
                <Link
                  to="/login"
                  className="px-3.5 h-10 inline-flex items-center text-xs font-semibold rounded-full bg-white/80 backdrop-blur-md border border-white/80 text-neutral-800 hover:bg-white shadow-sm transition shrink-0"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="px-3.5 h-10 inline-flex items-center text-xs font-semibold rounded-full bg-tinder text-white shadow-tinder/40 shadow-md hover:brightness-110 transition shrink-0"
                >
                  Sign up
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
