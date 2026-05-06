import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeTopBar from '../components/HomeTopBar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';
import UserCard from '../components/UserCard.jsx';
import AdultGateModal from '../components/AdultGateModal.jsx';

const PATH_TO_TAB = {
  '/popular': 'popular',
  '/liked': 'following',
  '/requests': 'requests',
};

export default function Home() {
  const me = useAuthStore((s) => s.user);
  const loc = useLocation();

  const [tab, setTabState] = useState(PATH_TO_TAB[loc.pathname] || 'popular');

  useEffect(() => {
    const next = PATH_TO_TAB[loc.pathname] || 'popular';
    if (next !== tab) setTabState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState([]);
  const [onlineItems, setOnlineItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  // 18+ section state. `adultMode` flips the popular/online query to fetch
  // adult creators. `adultPending` is true while the gate modal is up;
  // confirming flips adultMode true. Modal re-shows EVERY time the user
  // taps the 18+ tab fresh (no localStorage cookie).
  const [adultMode, setAdultMode] = useState(false);
  const [adultPending, setAdultPending] = useState(false);
  const debounceRef = useRef(null);
  const sentinelRef = useRef(null);
  // Stable refs for the values loadMore needs — avoids re-creating the
  // IntersectionObserver every time `cursor`/`tab` changes.
  const cursorRef = useRef(null);
  const tabRef = useRef(tab);
  const adultRef = useRef(false);
  const loadingMoreRef = useRef(false);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { adultRef.current = adultMode; }, [adultMode]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);

  useEffect(() => {
    if (!me) return;
    api
      .get('/follow/requests/incoming')
      .then((r) => {
        setRequests(r.data.items);
        setRequestCount(r.data.items.length);
      })
      .catch(() => {});
  }, [me]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery) return;
    setLoading(true);
    setError(null);
    setCursor(null);
    const load = async () => {
      try {
        if (tab === 'popular') {
          const params = { limit: 20, adult: adultMode ? 'true' : 'false' };
          const [popularRes, onlineRes] = await Promise.all([
            api.get('/popular', { params }),
            api.get('/users/online', { params: { adult: adultMode ? 'true' : 'false' } }),
          ]);
          setItems(popularRes.data.items);
          setCursor(popularRes.data.nextCursor);
          setOnlineItems(onlineRes.data.items);
        } else if (tab === 'following') {
          const { data } = await api.get('/users/me/following');
          setItems(data.items);
          setCursor(data.nextCursor);
        } else if (tab === 'requests') {
          const { data } = await api.get('/follow/requests/incoming');
          setRequests(data.items);
          setRequestCount(data.items.length);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tab, debouncedQuery, adultMode]);

  useEffect(() => {
    if (!debouncedQuery) return;
    setLoading(true);
    api
      .get('/users/search', { params: { q: debouncedQuery } })
      .then((r) => {
        setItems(r.data.items);
        setCursor(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  const loadMore = async () => {
    const c = cursorRef.current;
    if (!c || loadingMoreRef.current) return;
    setLoadingMore(true);
    try {
      const path = tabRef.current === 'popular' ? '/popular' : '/users/me/following';
      const params = { cursor: c };
      if (tabRef.current === 'popular') params.adult = adultRef.current ? 'true' : 'false';
      const { data } = await api.get(path, { params });
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Infinite scroll: observe the sentinel below the grid; when it scrolls
  // into view, fetch the next page.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '600px 0px' /* prefetch a bit before sentinel hits viewport */ },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // sentinelRef is stable; loadMore reads everything via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedQuery, items.length]);

  const respondRequest = async (id, action) => {
    try {
      await api.post(`/follow/respond/${id}`, { action });
      const next = requests.filter((r) => r._id !== id);
      setRequests(next);
      setRequestCount(next.length);
    } catch (err) {
      setError(err.message);
    }
  };

  const showSearch = !!debouncedQuery;

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-neutral-950 text-ink">
      {me && (
        <HomeSidebar
          me={me}
          onLogout={async () => {
            try { await api.post('/auth/logout'); } catch {}
            useAuthStore.getState().clear();
            window.location.href = '/login';
          }}
        />
      )}

      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#fff5f9] pb-16 lg:pb-0">
        <MobileTopBar />
        <div className="hidden lg:block px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-2 shrink-0">
          <HomeTopBar query={query} onQueryChange={setQuery} />
        </div>

        {(
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-8">{/* main's pb-16 reserves space for the mobile bottom bar */}
            {error && (
              <div className="px-4 py-2.5 mb-4 bg-rose-50 border border-rose-100 text-rose-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            {showSearch ? (
              <Grid items={items} loading={loading} emptyText={`No results for "${debouncedQuery}"`} />
            ) : tab === 'requests' ? (
              <RequestsList items={requests} onRespond={respondRequest} loading={loading} />
            ) : tab === 'following' ? (
              <Grid
                items={items}
                loading={loading}
                emptyText="You haven't subscribed to anyone yet."
              />
            ) : (
              <>
                {/* 18+ tabs disabled for now — keep <DiscoverTabs/> + the
                    AdultGateModal mount commented so we can re-enable later
                    without redoing the wiring. adultMode stays false, so all
                    queries hit the regular Discover bucket. */}
                {/*
                <DiscoverTabs
                  adultMode={adultMode}
                  onSwitch={(next) => {
                    if (next === adultMode) return;
                    if (next === true) {
                      setAdultPending(true);     // open the gate modal
                    } else {
                      setAdultMode(false);
                    }
                  }}
                />
                */}

                {onlineItems.length > 0 && (
                  <section className="mb-8">
                    <SectionHeader title="Online now" emoji="🔥" />
                    <Grid items={onlineItems} loading={false} emptyText="" />
                  </section>
                )}
                <section>
                  <SectionHeader title="Popular" emoji="✨" />
                  <Grid items={items} loading={loading} emptyText="No creators yet." />

                  {/* Infinite-scroll sentinel + spinner */}
                  {cursor && (
                    <>
                      <div ref={sentinelRef} className="h-1" />
                      <div className="mt-6 flex justify-center">
                        <span
                          aria-label="Loading more"
                          className="inline-block w-6 h-6 rounded-full border-2 border-neutral-200 border-t-tinder animate-spin"
                        />
                      </div>
                    </>
                  )}
                  {!cursor && items.length > 0 && (
                    <p className="mt-8 text-center text-xs text-neutral-400">
                      That's everyone — you've seen them all.
                    </p>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </main>

      <HomeBottomBar />

      {/* 18+ gate modal — disabled along with the DiscoverTabs above. */}
      {/*
      <AdultGateModal
        open={adultPending}
        onConfirm={() => {
          setAdultPending(false);
          setAdultMode(true);
        }}
        onCancel={() => setAdultPending(false)}
      />
      */}
    </div>
  );
}

function DiscoverTabs({ adultMode, onSwitch }) {
  const baseTabCls =
    'flex-1 px-4 py-2.5 rounded-full text-sm font-semibold transition focus:outline-none';
  return (
    <div className="mb-6 inline-flex w-full max-w-xs p-1 rounded-full bg-white/70 backdrop-blur-md border border-white/80 shadow-sm">
      <button
        type="button"
        onClick={() => onSwitch(false)}
        className={`${baseTabCls} ${
          !adultMode
            ? 'bg-tinder text-white shadow-tinder/40 shadow'
            : 'text-neutral-600 hover:text-ink'
        }`}
      >
        Discover
      </button>
      <button
        type="button"
        onClick={() => onSwitch(true)}
        className={`${baseTabCls} ${
          adultMode
            ? 'bg-rose-600 text-white shadow-rose-600/40 shadow'
            : 'text-neutral-600 hover:text-ink'
        }`}
      >
        18+
      </button>
    </div>
  );
}

function SectionHeader({ title, emoji }) {
  return (
    <h2 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2">
      {title} {emoji && <span>{emoji}</span>}
    </h2>
  );
}

function Grid({ items, loading, emptyText }) {
  if (loading && items.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-2xl bg-white/70 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return <p className="text-center text-sm text-neutral-500 py-16">{emptyText}</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {items.map((u) => (
        <UserCard key={u.id} user={u} />
      ))}
    </div>
  );
}

function RequestsList({ items, onRespond, loading }) {
  if (loading && !items.length) return <p className="text-center text-sm text-neutral-400 py-10">Loading…</p>;
  if (!items.length) return <p className="text-center text-sm text-neutral-500 py-16">No pending requests.</p>;
  return (
    <ul className="divide-y divide-neutral-200">
      {items.map((r) => (
        <li key={r._id} className="flex items-center gap-3 py-3">
          <div className="w-10 h-10 rounded-full bg-neutral-200 grid place-items-center text-sm font-medium text-neutral-600">
            {(r.from?.displayName || r.from?.username || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <Link to={`/u/${r.from?.username}`} className="font-medium text-sm hover:underline">
              {r.from?.displayName || r.from?.username}
            </Link>
            <p className="text-xs text-neutral-500 truncate">@{r.from?.username}</p>
          </div>
          <button
            onClick={() => onRespond(r._id, 'reject')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition"
          >
            Reject
          </button>
          <button
            onClick={() => onRespond(r._id, 'accept')}
            className="px-3 py-1.5 text-xs font-semibold rounded-full text-white bg-tinder shadow-tinder/30 hover:brightness-110 transition"
          >
            Accept
          </button>
        </li>
      ))}
    </ul>
  );
}
