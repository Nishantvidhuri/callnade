import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RotateCw, Wallet, Check, X, AlertCircle, Image as ImageIcon,
  ExternalLink, Copy, ArrowDownLeft, ArrowUpRight, TrendingUp,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { disconnectSocket } from '../services/socket.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';
import { fmtCredits } from '../utils/formatCredits.js';

/**
 * Admin wallet-request review queue rendered as a single table with
 * two tabs:
 *
 *   - Earnings: top-up requests (money users want credited).
 *   - Payout:   withdrawal requests (money to send to creators).
 *
 * Approve / Reject open a confirmation modal so we don't move money
 * on a single accidental tap.
 */
export default function AdminWalletRequests() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();

  const [tab, setTab] = useState('earnings'); // 'earnings' | 'payout'
  const [statusFilter, setStatusFilter] = useState('pending'); // 'pending' | 'all'
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [counts, setCounts] = useState({ earnings: 0, payout: 0 });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [zoomQrFor, setZoomQrFor] = useState(null);
  const [confirm, setConfirm] = useState(null); // { request, action }

  const apiType = tab === 'earnings' ? 'topup' : 'withdraw';
  const PAGE_SIZE = 30;

  // Stable refs the IntersectionObserver hooks read so we don't have
  // to re-create the observer when state changes.
  const sentinelRef = useRef(null);
  const cursorRef = useRef(null);
  const loadingMoreRef = useRef(false);
  useEffect(() => { cursorRef.current = cursor; }, [cursor]);
  useEffect(() => { loadingMoreRef.current = loadingMore; }, [loadingMore]);

  // First page (or refresh): wipes the list + refetches the stats.
  const loadFirstPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { type: apiType, limit: PAGE_SIZE };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/admin/wallet-requests', { params });
      setItems(data.items);
      setCursor(data.nextCursor || null);

      // Side-fetch the aggregate cash-flow stats so the in/out/profit
      // cards stay current, plus the pending counts for tab badges.
      const { data: s } = await api.get('/admin/wallet-stats');
      setStats(s);
      setCounts({ earnings: s.pendingIn.count, payout: s.pendingOut.count });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Subsequent pages — appends and only updates the cursor.
  const loadMore = async () => {
    const c = cursorRef.current;
    if (!c || loadingMoreRef.current) return;
    setLoadingMore(true);
    try {
      const params = { type: apiType, limit: PAGE_SIZE, cursor: c };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/admin/wallet-requests', { params });
      setItems((curr) => [...curr, ...data.items]);
      setCursor(data.nextCursor || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  // Wire up the bottom sentinel — when it scrolls into view, fetch the
  // next page. Re-attach when cursor flips between null/non-null so
  // the observer is only active while there's actually a next page.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !cursor) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: '200px 0px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, tab, statusFilter]);

  const onLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    useAuthStore.getState().clear();
    disconnectSocket();
    nav('/login', { replace: true });
  };

  const isPayout = tab === 'payout';

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-neutral-950 text-ink">
      <HomeSidebar me={me} onLogout={onLogout} />

      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#fff5f9]">
        <MobileTopBar />
        <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-3 shrink-0">
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
                <Wallet size={22} className="text-brand-500" /> Wallet requests
              </h1>
            </div>
            <button
              type="button"
              onClick={loadFirstPage}
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

        {/* Cash-flow stats — money in, money out, net profit. */}
        <div className="px-4 sm:px-6 lg:px-8 pb-3 shrink-0">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard
              tone="emerald"
              icon={<ArrowDownLeft size={16} />}
              label="Money in"
              value={stats?.in.total ?? 0}
              hint={`${stats?.in.count ?? 0} approved · ${stats?.pendingIn.count ?? 0} pending`}
            />
            <StatCard
              tone="rose"
              icon={<ArrowUpRight size={16} />}
              label="Money out"
              value={stats?.out.total ?? 0}
              hint={`${stats?.out.count ?? 0} approved · ${stats?.pendingOut.count ?? 0} pending`}
            />
            <StatCard
              tone={(stats?.profit ?? 0) >= 0 ? 'amber' : 'rose'}
              icon={<TrendingUp size={16} />}
              label="Net profit"
              value={stats?.profit ?? 0}
              hint={(stats?.profit ?? 0) >= 0 ? 'in − out' : 'cash deficit'}
            />
          </div>
        </div>

        {/* Tabs row */}
        <div className="px-4 sm:px-6 lg:px-8 shrink-0 border-b border-rose-100">
          <div className="flex items-end gap-1">
            <Tab
              active={tab === 'earnings'}
              onClick={() => setTab('earnings')}
              count={counts.earnings}
            >
              Earnings
            </Tab>
            <Tab
              active={tab === 'payout'}
              onClick={() => setTab('payout')}
              count={counts.payout}
            >
              Payout
            </Tab>
            <div className="flex-1" />
            <div className="pb-2 hidden sm:flex items-center gap-1 text-xs">
              <FilterChip
                active={statusFilter === 'pending'}
                onClick={() => setStatusFilter('pending')}
              >
                Pending
              </FilterChip>
              <FilterChip
                active={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
              >
                All
              </FilterChip>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 pb-24 lg:pb-8">
          {/* Mobile filter chips — sm hides them above. */}
          <div className="sm:hidden flex items-center gap-1 mb-3 text-xs">
            <FilterChip
              active={statusFilter === 'pending'}
              onClick={() => setStatusFilter('pending')}
            >
              Pending
            </FilterChip>
            <FilterChip
              active={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
            >
              All
            </FilterChip>
          </div>

          {error && (
            <div className="mb-3 px-4 py-2.5 bg-rose-50 border border-rose-100 text-rose-700 text-sm rounded-xl">
              {error}
            </div>
          )}

          {loading && items.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-12">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-12 bg-white rounded-2xl border border-neutral-200">
              {statusFilter === 'pending'
                ? `No pending ${isPayout ? 'payouts' : 'top-ups'} in the queue.`
                : `No ${isPayout ? 'payout' : 'top-up'} requests yet.`}
            </p>
          ) : (
            <>
              <RequestsTable
                items={items}
                isPayout={isPayout}
                onApprove={(r) => setConfirm({ request: r, action: 'approve' })}
                onReject={(r) => setConfirm({ request: r, action: 'reject' })}
                onZoomQr={(r) => setZoomQrFor({ id: r.id, url: r.qrUrl || null, note: r.upiId || '' })}
              />

              {/* Bottom sentinel — when this scrolls into view we
                  fetch the next page. Rendered only while there's a
                  next cursor to chase. */}
              {cursor && (
                <div
                  ref={sentinelRef}
                  className="py-6 grid place-items-center text-xs text-neutral-500"
                >
                  {loadingMore ? (
                    <span className="inline-flex items-center gap-2">
                      <RotateCw size={13} className="animate-spin" /> Loading more…
                    </span>
                  ) : (
                    <span className="opacity-60">Scroll for more</span>
                  )}
                </div>
              )}
              {!cursor && items.length > 0 && (
                <p className="py-5 text-center text-[11px] text-neutral-400">
                  End of list · {items.length} {items.length === 1 ? 'request' : 'requests'}
                </p>
              )}
            </>
          )}
        </div>
      </main>
      <HomeBottomBar />

      {confirm && (
        <ConfirmActionModal
          request={confirm.request}
          isPayout={isPayout}
          action={confirm.action}
          onClose={() => setConfirm(null)}
          onActioned={() => {
            setConfirm(null);
            loadFirstPage();
          }}
        />
      )}

      {zoomQrFor && (
        <QrZoomModal
          requestId={zoomQrFor.id}
          directUrl={zoomQrFor.url}
          note={zoomQrFor.note}
          onClose={() => setZoomQrFor(null)}
        />
      )}
    </div>
  );
}

function StatCard({ tone, icon, label, value, hint }) {
  const styles = {
    emerald: { bg: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700' },
    rose: { bg: 'bg-rose-50 border-rose-200', icon: 'bg-rose-100 text-rose-700', value: 'text-rose-700' },
    amber: { bg: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-700', value: 'text-amber-700' },
  }[tone] || { bg: 'bg-white border-neutral-200', icon: 'bg-neutral-100 text-neutral-700', value: 'text-ink' };

  return (
    <div className={`rounded-2xl border p-2.5 sm:p-4 min-w-0 ${styles.bg}`}>
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full grid place-items-center shrink-0 ${styles.icon}`}
        >
          {icon}
        </span>
        <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wide text-neutral-500 truncate">
          {label}
        </p>
      </div>
      <p
        className={`text-base sm:text-2xl font-bold tabular-nums leading-tight mt-1 ${styles.value} break-all`}
      >
        ₹{fmtCredits(value)}
      </p>
      <p className="text-[9px] sm:text-[11px] text-neutral-500 mt-0.5 truncate">{hint}</p>
    </div>
  );
}

function RequestsTable({ items, isPayout, onApprove, onReject, onZoomQr }) {
  return (
    <>
      {/* Desktop / wide tablets: light table card. */}
      <div className="hidden lg:block rounded-3xl bg-white border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-700 bg-neutral-50">
                <Th>User</Th>
                <Th align="right">Wallet now</Th>
                <Th align="right">Requested</Th>
                <Th align="center">Screenshot</Th>
                <Th>{isPayout ? 'Pay to UPI' : 'UTR / Ref'}</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <Row
                  key={r.id}
                  r={r}
                  isPayout={isPayout}
                  onApprove={() => onApprove(r)}
                  onReject={() => onReject(r)}
                  onZoomQr={() => onZoomQr(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile / tablet: card list. */}
      <ul className="lg:hidden space-y-2.5">
        {items.map((r) => (
          <RequestCard
            key={r.id}
            r={r}
            isPayout={isPayout}
            onApprove={() => onApprove(r)}
            onReject={() => onReject(r)}
            onZoomQr={() => onZoomQr(r)}
          />
        ))}
      </ul>
    </>
  );
}

function RequestCard({ r, isPayout, onApprove, onReject, onZoomQr }) {
  const isPending = r.status === 'pending';
  const balance = isPayout ? r.user?.earningsBalance ?? 0 : r.user?.walletBalance ?? 0;
  return (
    <li
      className={`rounded-2xl bg-white border border-neutral-200 shadow-sm p-4 ${
        isPending ? '' : 'opacity-60'
      }`}
    >
      {/* Top row: user + amount. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {r.user?.username ? (
              <Link
                to={`/u/${r.user.username}`}
                className="font-semibold text-sm text-ink hover:underline"
              >
                @{r.user.username}
              </Link>
            ) : (
              <span className="text-neutral-500 text-sm">unknown</span>
            )}
            <StatusPill status={r.status} />
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {(r.user?.role || 'user')} · {fmtDate(r.createdAt)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold">Requested</p>
          <p className="text-xl font-bold tabular-nums text-ink">₹{fmtCredits(r.amount)}</p>
        </div>
      </div>

      {/* Three-column metric strip: wallet / requested / screenshot. */}
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-neutral-50 border border-neutral-100 p-2.5 text-center">
        <Metric label="Wallet now" value={`${fmtCredits(balance)}`} />
        <Metric label="Requested" value={`₹${fmtCredits(r.amount)}`} />
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold">Screenshot</p>
          {r.hasQr ? (
            <button
              type="button"
              onClick={onZoomQr}
              className="mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-[11px] font-semibold transition"
            >
              <ImageIcon size={10} /> View
            </button>
          ) : (
            <p className="text-sm text-neutral-300 mt-0.5">—</p>
          )}
        </div>
      </div>

      {/* Reference / UPI line. */}
      {(isPayout ? r.upiId : r.referenceId) && (
        <div className="mt-2.5 text-[11px] flex items-baseline gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold">
            {isPayout ? 'Pay to UPI' : 'UTR / Ref'}
          </span>
          <CopyValue value={isPayout ? r.upiId : r.referenceId} />
        </div>
      )}
      {!isPayout && r.payerUpiId && (
        <div className="mt-1 text-[11px] flex items-baseline gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold">
            Paid from
          </span>
          <CopyValue value={r.payerUpiId} />
        </div>
      )}
      {r.adminNote && (
        <p className="mt-2 text-[11px] text-neutral-600 break-words">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold mr-1">
            Note
          </span>
          {r.adminNote}
        </p>
      )}

      {isPending ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-full text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm transition"
          >
            <Check size={13} strokeWidth={2.4} />
            {isPayout ? 'Approve & debit' : 'Approve & credit'}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-full text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
          >
            <X size={13} strokeWidth={2.4} />
            Reject
          </button>
        </div>
      ) : (
        r.actionedAt && (
          <p className="mt-2 text-[11px] text-neutral-400">
            Actioned {fmtDate(r.actionedAt)}
          </p>
        )
      )}
    </li>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500 font-bold">{label}</p>
      <p className="text-sm font-bold tabular-nums mt-0.5 text-ink">{value}</p>
    </div>
  );
}

function Row({ r, isPayout, onApprove, onReject, onZoomQr }) {
  const isPending = r.status === 'pending';
  const balance = isPayout
    ? r.user?.earningsBalance ?? 0
    : r.user?.walletBalance ?? 0;
  const refOrUpi = isPayout ? r.upiId : r.referenceId;

  return (
    <tr
      className={`border-t border-neutral-100 ${
        isPending ? 'hover:bg-neutral-50/60' : 'opacity-60'
      }`}
    >
      <Td>
        {r.user?.username ? (
          <div className="min-w-0">
            <Link
              to={`/u/${r.user.username}`}
              className="font-semibold text-ink hover:underline"
            >
              @{r.user.username}
            </Link>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {r.user.role || 'user'} · {fmtDate(r.createdAt)}
            </p>
          </div>
        ) : (
          <span className="text-neutral-400">unknown</span>
        )}
      </Td>
      <Td align="right">
        <span className="font-mono tabular-nums text-neutral-700">
          {fmtCredits(balance)}
        </span>
      </Td>
      <Td align="right">
        <span className="font-bold tabular-nums text-ink">
          ₹{fmtCredits(r.amount)}
        </span>
      </Td>
      <Td align="center">
        {r.hasQr ? (
          <button
            type="button"
            onClick={onZoomQr}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold transition"
          >
            <ImageIcon size={12} /> View
          </button>
        ) : (
          <span className="text-neutral-300">—</span>
        )}
      </Td>
      <Td>
        {refOrUpi ? (
          <CopyValue value={refOrUpi} />
        ) : (
          <span className="text-neutral-300">—</span>
        )}
      </Td>
      <Td align="right">
        {isPending ? (
          <div className="inline-flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={onApprove}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm transition"
            >
              <Check size={12} strokeWidth={2.4} /> Approve
            </button>
            <button
              type="button"
              onClick={onReject}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-full text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
            >
              <X size={12} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <StatusPill status={r.status} />
        )}
      </Td>
    </tr>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th
      className={`px-5 py-4 font-semibold text-${align} whitespace-nowrap text-sm tracking-tight`}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <td className={`px-5 py-4 align-middle text-${align}`}>{children}</td>
  );
}

function Tab({ active, onClick, count, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px inline-flex items-center gap-2 ${
        active
          ? 'border-brand-500 text-ink'
          : 'border-transparent text-neutral-500 hover:text-ink'
      }`}
    >
      {children}
      {count > 0 && (
        <span
          className={`min-w-[20px] h-5 px-1.5 grid place-items-center text-[10px] font-bold rounded-full ${
            active ? 'bg-brand-500 text-white' : 'bg-neutral-200 text-neutral-700'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center px-3 py-1.5 rounded-full border font-semibold transition ${
        active
          ? 'bg-ink text-white border-ink'
          : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status, dark }) {
  const cls = dark
    ? status === 'approved'
      ? 'bg-emerald-500/20 text-emerald-300'
      : status === 'rejected'
      ? 'bg-rose-500/20 text-rose-300'
      : 'bg-amber-500/20 text-amber-300'
    : status === 'approved'
    ? 'bg-emerald-100 text-emerald-700'
    : status === 'rejected'
    ? 'bg-rose-100 text-rose-700'
    : 'bg-amber-100 text-amber-700';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${cls}`}
    >
      {status}
    </span>
  );
}

function CopyValue({ value, dark }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  const baseCls = dark
    ? 'text-white/85 hover:bg-white/10'
    : 'hover:bg-neutral-100';
  const idleIconCls = dark ? 'text-white/40' : 'text-neutral-400';
  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 -mx-1 rounded font-mono text-xs transition group max-w-[200px] ${baseCls}`}
      title="Copy"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check size={11} className="text-emerald-400 shrink-0" />
      ) : (
        <Copy size={11} className={`${idleIconCls} shrink-0 opacity-0 group-hover:opacity-100`} />
      )}
    </button>
  );
}

function ConfirmActionModal({ request, isPayout, action, onClose, onActioned }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const isApprove = action === 'approve';
  const canSubmit = isApprove || note.trim().length >= 2;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const path = isApprove
        ? isPayout
          ? `/admin/wallet-requests/${request.id}/approve-withdraw`
          : `/admin/wallet-requests/${request.id}/approve-topup`
        : `/admin/wallet-requests/${request.id}/reject`;
      await api.post(path, { adminNote: note.trim() || undefined });
      onActioned?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sideEffect = isApprove
    ? isPayout
      ? `Subtract ${fmtCredits(request.amount)} credits from @${request.user?.username || 'user'}'s earnings.`
      : `Add ${fmtCredits(request.amount)} credits to @${request.user?.username || 'user'}'s wallet.`
    : `Mark this request as rejected. No balance changes.`;

  const headerCls = isApprove ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white';
  const ctaCls = isApprove
    ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30'
    : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/30';

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/55 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm my-auto rounded-3xl bg-white shadow-2xl overflow-hidden animate-[pop_150ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`px-5 py-4 flex items-center gap-3 ${headerCls}`}>
          <span className="w-9 h-9 rounded-full bg-white/20 grid place-items-center">
            {isApprove ? <Check size={18} strokeWidth={2.4} /> : <X size={18} strokeWidth={2.4} />}
          </span>
          <h3 className="font-bold text-base flex-1">
            {isApprove
              ? isPayout
                ? 'Approve payout?'
                : 'Approve top-up?'
              : 'Reject request?'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/20 transition"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-3.5">
            <p className="text-[11px] uppercase tracking-wide font-bold text-neutral-500">
              {isPayout ? 'Payout' : 'Top-up'} · @{request.user?.username || '?'}
            </p>
            <p className="text-2xl font-bold tabular-nums text-ink mt-0.5">
              ₹{fmtCredits(request.amount)}
            </p>
            {!isPayout && request.referenceId && (
              <p className="text-[11px] mt-1.5">
                <span className="font-bold text-neutral-500 uppercase tracking-wide mr-1">UTR:</span>
                <span className="font-mono break-all">{request.referenceId}</span>
              </p>
            )}
            {!isPayout && request.payerUpiId && (
              <p className="text-[11px] mt-0.5">
                <span className="font-bold text-neutral-500 uppercase tracking-wide mr-1">From:</span>
                <span className="font-mono break-all">{request.payerUpiId}</span>
              </p>
            )}
            {isPayout && request.upiId && (
              <p className="text-[11px] mt-1.5">
                <span className="font-bold text-neutral-500 uppercase tracking-wide mr-1">Pay to:</span>
                <span className="font-mono break-all">{request.upiId}</span>
              </p>
            )}
            {request.user && (
              <p className="text-[11px] mt-1.5 text-neutral-500">
                {isPayout ? 'Earnings' : 'Wallet'} balance now:{' '}
                <span className="font-mono text-ink">
                  {fmtCredits(isPayout ? request.user.earningsBalance : request.user.walletBalance)}
                </span>
              </p>
            )}
          </div>

          <div
            className={`flex items-start gap-2 rounded-2xl border p-3 text-xs ${
              isApprove
                ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                : 'border-rose-200 bg-rose-50/60 text-rose-800'
            }`}
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">{sideEffect}</p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
              Admin note {isApprove ? '(optional)' : '(required)'}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={
                isApprove
                  ? 'e.g. matched UTR on bank statement, payout txn id, etc.'
                  : 'Reason for rejection (shown back to the user)'
              }
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-neutral-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition resize-none"
            />
          </label>

          {err && (
            <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-1.5">
              <AlertCircle size={13} /> {err}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-sm font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 disabled:opacity-50 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || submitting}
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-full text-white shadow-md transition disabled:opacity-50 ${ctaCls}`}
            >
              {isApprove ? <Check size={14} strokeWidth={2.4} /> : <X size={14} strokeWidth={2.4} />}
              {submitting ? 'Working…' : isApprove ? 'Confirm approve' : 'Confirm reject'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function QrZoomModal({ requestId, directUrl, note, onClose }) {
  // If the row already has a public R2 URL, use it directly — no
  // auth-gated blob fetch needed. Otherwise fall back to the legacy
  // /admin/wallet-requests/:id/qr stream for old rows that still
  // have qrData bytes in Mongo.
  const [imgUrl, setImgUrl] = useState(directUrl || null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (directUrl) return undefined;
    let cancelled = false;
    api
      .get(`/admin/wallet-requests/${requestId}/qr`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return;
        const blob = r.data;
        if (!blob || blob.size === 0) {
          setErr('QR image is empty.');
          return;
        }
        if (!blob.type?.startsWith('image/')) {
          setErr('Server returned a non-image response.');
          return;
        }
        setImgUrl(URL.createObjectURL(blob));
      })
      .catch((e) => !cancelled && setErr(e.message || 'Failed to load QR.'));
    return () => {
      cancelled = true;
    };
  }, [requestId, directUrl]);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-neutral-950 text-white shadow-2xl overflow-hidden flex flex-col animate-[pop_150ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3.5 border-b border-white/10 flex items-center gap-2">
          <ImageIcon size={16} className="text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">Withdrawal QR</p>
            {note && <p className="text-[11px] font-mono text-white/60 truncate">{note}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>
        <div className="bg-black grid place-items-center min-h-[260px]">
          {err ? (
            <p className="text-rose-300 text-sm py-10 px-6 text-center">{err}</p>
          ) : !imgUrl ? (
            <p className="text-white/60 text-sm py-10">Loading…</p>
          ) : (
            <img src={imgUrl} alt="UPI QR screenshot" className="max-h-[70dvh] w-auto object-contain" />
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/60">
          <span>Cross-check the handle before paying.</span>
          {imgUrl && (
            <a
              href={imgUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-white/80 hover:text-white"
            >
              <ExternalLink size={11} /> Open
            </a>
          )}
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
