import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Activity, Smartphone, Tablet, Monitor, HelpCircle,
  MapPin, Globe, ScreenShare, Languages, Clock, RotateCw,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';
import { disconnectSocket } from '../services/socket.js';

export default function AdminVisits() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();

  const [items, setItems] = useState([]);
  // Pagination — cursor-based under the hood, but we track a history of
  // cursors so the user gets working Prev/Next buttons + a page counter.
  // history[i] is the cursor that fetches page i (history[0] is null = first
  // page). nextCursor is what the latest fetch returned.
  const [history, setHistory] = useState([null]);
  const [pageIdx, setPageIdx] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (cursor, idx) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/visits', {
        params: { cursor: cursor || undefined, limit: pageSize },
      });
      setItems(data.items);
      setNextCursor(data.nextCursor);
      setPageIdx(idx);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial load + reload whenever pageSize changes.
  useEffect(() => {
    setHistory([null]);
    load(null, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const refresh = () => {
    setHistory([null]);
    load(null, 0);
  };

  const goNext = () => {
    if (!nextCursor) return;
    const newIdx = pageIdx + 1;
    setHistory((h) => {
      // If user went back then forward, replace the rest of history.
      const trimmed = h.slice(0, pageIdx + 1);
      trimmed[newIdx] = nextCursor;
      return trimmed;
    });
    load(nextCursor, newIdx);
  };

  const goPrev = () => {
    if (pageIdx === 0) return;
    const newIdx = pageIdx - 1;
    load(history[newIdx], newIdx);
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
        <MobileTopBar />
        <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav('/admin')}
              className="lg:hidden w-9 h-9 grid place-items-center rounded-full bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white"
              aria-label="Back"
            >
              <ArrowLeft size={18} strokeWidth={1.8} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
                <Activity size={22} className="text-brand-500" /> Visit log
              </h1>
              <p className="text-sm text-neutral-500 mt-0.5">
                One row per browser session — first page load only, not per navigation.
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 transition shrink-0"
            >
              <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-24 lg:pb-8">
          {error && (
            <div className="mb-3 px-4 py-2.5 bg-rose-50 border border-rose-100 text-rose-700 text-sm rounded-xl">
              {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-12">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-12">No visits logged yet.</p>
          ) : (
            <ul className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
              {items.map((v) => (
                <li key={v.id} className="px-4 py-3.5 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-neutral-100 grid place-items-center text-neutral-600 shrink-0">
                    {iconFor(v.deviceType)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                      <p className="font-semibold text-sm">
                        {v.username ? (
                          <Link to={`/u/${v.username}`} className="hover:underline">
                            @{v.username}
                          </Link>
                        ) : (
                          <span className="text-neutral-500">Anonymous</span>
                        )}
                      </p>
                      <span className="text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                        {v.deviceType || 'unknown'}
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        {v.os}{v.osVersion ? ` ${v.osVersion}` : ''} · {v.browser}{v.browserVersion ? ` ${v.browserVersion}` : ''}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                      {v.ip && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={10} /> <span className="font-mono">{v.ip}</span>
                        </span>
                      )}
                      {v.timezone && (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10} /> {v.timezone}
                        </span>
                      )}
                      {v.language && (
                        <span className="inline-flex items-center gap-1">
                          <Languages size={10} /> {v.language}
                        </span>
                      )}
                      {v.screen && (
                        <span className="inline-flex items-center gap-1">
                          <ScreenShare size={10} /> {v.screen}
                          {v.dpr && v.dpr !== 1 && <span className="opacity-70">·{v.dpr}x</span>}
                        </span>
                      )}
                      {v.path && (
                        <span className="inline-flex items-center gap-1">
                          <Globe size={10} /> <span className="font-mono">{v.path}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-neutral-400 mt-1">
                      {fmt(v.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Pagination footer */}
          {(items.length > 0 || pageIdx > 0) && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <label className="inline-flex items-center gap-2 text-neutral-500">
                <span>Per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1 rounded-lg border border-neutral-200 bg-white text-ink focus:outline-none focus:border-brand-300"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </label>

              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={pageIdx === 0 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft size={13} />
                  <span className="hidden sm:inline">Prev</span>
                </button>
                <span className="px-3 py-1.5 rounded-full bg-neutral-100 font-semibold tabular-nums text-neutral-700">
                  Page {pageIdx + 1}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!nextCursor || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
      <HomeBottomBar />
    </div>
  );
}

function iconFor(type) {
  if (type === 'phone') return <Smartphone size={16} />;
  if (type === 'tablet') return <Tablet size={16} />;
  if (type === 'desktop') return <Monitor size={16} />;
  return <HelpCircle size={16} />;
}

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
