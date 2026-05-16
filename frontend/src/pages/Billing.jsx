import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, Wallet,
  PhoneOff, PhoneIncoming, PhoneOutgoing, RotateCw, ChevronRight,
  Plus, ArrowDownToLine, X, Upload, Check, AlertCircle,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { disconnectSocket } from '../services/socket.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';
import { fmtCredits } from '../utils/formatCredits.js';

// Static merchant assets for the Add-credits flow. Razorpay's automated
// path is parked (kept on the backend so we can re-enable later), and
// we're running a manual reconciliation flow: user pays via UPI by
// scanning this QR, then pastes the bank reference into the form so
// an admin can match + credit the wallet.
// Hardcoded fallback used when the admin pool is empty or the
// /wallet/payment-qr fetch fails. The live page picks one at random
// from the admin-managed pool (see AdminPaymentQrs).
const PAYMENT_QR_FALLBACK =
  'https://assetscdn1.paytm.com/images/catalog/product/F/FU/FULUN-MAPPED-SOSOUN117245820429677/1629993190693_3.jpg';
const MERCHANT_NAME = 'callnade pvt ltd';
const MERCHANT_UPI_ID = 'callnade@paytm';

/**
 * Billing / transactions page. Each row is one call's worth of money
 * movement — outgoing for calls the user initiated, incoming for calls
 * they received as a creator. Summary cards at the top show running
 * totals + counts across the user's full history.
 */
export default function Billing() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    outgoingTotal: 0,
    outgoingCount: 0,
    incomingTotal: 0,
    incomingCount: 0,
  });
  const [walletRequests, setWalletRequests] = useState([]);
  const [zoomImageUrl, setZoomImageUrl] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'incoming' | 'outgoing'
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tx, reqs] = await Promise.all([
        api.get('/calls/transactions', { params: { limit: 30 } }),
        api.get('/wallet/requests'),
      ]);
      setItems(tx.data.items);
      setCursor(tx.data.nextCursor);
      setSummary(tx.data.summary);
      setWalletRequests(reqs.data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get('/calls/transactions', {
        params: { limit: 30, cursor },
      });
      setItems((curr) => [...curr, ...data.items]);
      setCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    useAuthStore.getState().clear();
    disconnectSocket();
    nav('/login', { replace: true });
  };

  const isProvider = me?.role === 'provider';
  const isAdmin = me?.role === 'admin' || me?.isAdmin;
  // Only creators (and admins, for support purposes) earn money. Regular
  // users can't withdraw, so we hide the Earnings card, the Incoming
  // filter chip, and any incoming transaction rows for them.
  const canEarn = isProvider || isAdmin;

  // Filter + dedupe in one pass.
  //
  // Older calls were recorded twice in the DB because of a re-entry
  // bug in the backend's `endCall` (now fixed) — both peers' hangup
  // events plus the server's own end emit could all run the
  // recordSession path concurrently. New calls are clean, but the
  // historical duplicates are still in `callsessions`.
  //
  // The duplicates aren't byte-identical: `endedAt` (and therefore
  // `durationSec`) often differs by 1s because the two end-paths
  // resolved a moment apart. So an exact-tuple key misses them.
  // We round the timestamp to the minute and drop duration from the
  // key — same direction + peer + minute + amount is the same call
  // for any practical purpose, and amount nailing it down avoids
  // collapsing genuinely-different back-to-back calls.
  const minuteKey = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${d.getUTCMinutes()}`;
  };
  const visible = (() => {
    const seen = new Set();
    return items.filter((t) => {
      if (!canEarn && t.direction !== 'outgoing') return false;
      if (filter !== 'all' && t.direction !== filter) return false;
      // Referral rows are uniquely identified by their server id —
      // never collapse them into call rows even if amounts/timestamps
      // happen to coincide. Call dedup keeps the looser tuple key
      // (covers the historical double-write bug).
      const key =
        t.kind === 'referral'
          ? `ref:${t.id}`
          : `${t.direction}|${t.peer?.id || 'none'}|${minuteKey(t.at)}|${t.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  // Action modal state — Add credits (regular users) and Withdraw
  // earnings (creators) are not self-service yet; admins move balances
  // from the admin panel for now. The modal explains that, plus shows
  // the user a copyable summary they can paste into a support ticket.
  const [actionOpen, setActionOpen] = useState(null); // 'add' | 'withdraw' | 'withdraw-referral' | null

  // Deep-linked withdraw flow: /billing?withdraw=referral opens the
  // referral-withdraw modal as soon as the page mounts. Used by the
  // ReferralCard's Withdraw button on the Profile page.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const intent = params.get('withdraw');
    if (intent === 'referral') {
      setActionOpen('withdraw-referral');
      // Strip the param so a second visit doesn't re-open the modal
      // accidentally.
      const next = new URLSearchParams(params);
      next.delete('withdraw');
      setParams(next, { replace: true });
    } else if (intent === 'earnings') {
      setActionOpen('withdraw');
      const next = new URLSearchParams(params);
      next.delete('withdraw');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-neutral-950 text-ink">
      <HomeSidebar me={me} onLogout={onLogout} />

      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#fff5f9]">
        <MobileTopBar />
        <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav(-1)}
              className="lg:hidden w-9 h-9 grid place-items-center rounded-full bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white"
              aria-label="Back"
            >
              <ArrowLeft size={18} strokeWidth={1.8} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Billing</h1>
              <p className="text-sm text-neutral-500 mt-0.5">
                {canEarn
                  ? 'Your incoming and outgoing call payments.'
                  : 'Your wallet balance and call payments.'}
              </p>
            </div>
            <button
              type="button"
              onClick={load}
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

          {/* Balance + action cards.
              - Regular users see the Wallet card (Add credits) plus a
                Referral wallet card (Withdraw) when they have any
                referral balance.
              - Creators (providers) see Earnings (Withdraw) plus the
                Referral wallet card when applicable.
              - Admins see all three for support.
              The grid auto-collapses to fewer columns when fewer cards
              render so we don't leave holes. */}
          {(() => {
            const showWallet = !isProvider;
            const showEarnings = canEarn;
            // Always show the referral card for non-creators so they
            // see it as a discoverable revenue stream even at zero
            // balance. Creators only see it when they actually have
            // referral credits (avoids cluttering their billing view
            // with an empty card).
            const showReferral =
              !isProvider || (me?.referralWalletBalance || 0) > 0;
            const cardCount =
              (showWallet ? 1 : 0) + (showEarnings ? 1 : 0) + (showReferral ? 1 : 0);
            const gridCls =
              cardCount >= 3
                ? 'grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5'
                : cardCount === 2
                ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5'
                : 'grid grid-cols-1 gap-3 mb-5';
            return (
              <section className={gridCls}>
                {showWallet && (
                  <BalanceActionCard
                    tone="wallet"
                    label="Wallet"
                    balance={me?.walletBalance ?? 0}
                    actionLabel="Add credits"
                    actionIcon={<Plus size={14} strokeWidth={2.6} />}
                    onAction={() => setActionOpen('add')}
                    lifetimeLabel="Spent on calls"
                    lifetimeValue={summary.outgoingTotal}
                    lifetimeCount={summary.outgoingCount}
                  />
                )}
                {showEarnings && (
                  <BalanceActionCard
                    tone="earnings"
                    label="Earnings"
                    balance={me?.earningsBalance ?? 0}
                    actionLabel="Withdraw"
                    actionIcon={<ArrowDownToLine size={14} strokeWidth={2.6} />}
                    onAction={() => setActionOpen('withdraw')}
                    lifetimeLabel="Earned from calls"
                    lifetimeValue={summary.incomingTotal}
                    lifetimeCount={summary.incomingCount}
                  />
                )}
                {showReferral && (
                  <BalanceActionCard
                    tone="earnings"
                    label="Referral wallet"
                    balance={me?.referralWalletBalance ?? 0}
                    actionLabel="Withdraw"
                    actionIcon={<ArrowDownToLine size={14} strokeWidth={2.6} />}
                    onAction={() => setActionOpen('withdraw-referral')}
                    lifetimeLabel="Earned from referrals"
                    lifetimeValue={me?.referralEarnings ?? 0}
                    lifetimeCount={me?.referralCount ?? 0}
                  />
                )}
              </section>
            );
          })()}

          {/* Wallet-request history. Top-ups for users, withdrawals
              for creators. Skipped entirely on first paint when the
              user has never submitted a request. */}
          {walletRequests.length > 0 && (
            <section className="mb-5">
              <header className="flex items-baseline justify-between mb-2">
                <h2 className="font-bold text-base">
                  {isProvider ? 'Withdrawal history' : 'Top-up history'}
                </h2>
                <span className="text-[11px] text-neutral-500">
                  {walletRequests.length} recent
                </span>
              </header>
              <ul className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
                {walletRequests.map((r) => (
                  <WalletRequestRow
                    key={r.id}
                    r={r}
                    onZoomImage={(url) => setZoomImageUrl(url)}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* Filter chips. Normal users only ever have outgoing rows
              (they can't earn), so the chip row is suppressed entirely
              and the list just shows everything. */}
          {canEarn && (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
                All
              </FilterChip>
              <FilterChip
                active={filter === 'incoming'}
                onClick={() => setFilter('incoming')}
                tone="emerald"
              >
                <ArrowDownLeft size={12} /> Incoming
              </FilterChip>
              <FilterChip
                active={filter === 'outgoing'}
                onClick={() => setFilter('outgoing')}
                tone="rose"
              >
                <ArrowUpRight size={12} /> Outgoing
              </FilterChip>
            </div>
          )}

          {loading && items.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-12">Loading…</p>
          ) : visible.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <ul className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
              {visible.map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </ul>
          )}

          {cursor && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </main>
      <HomeBottomBar />

      <ActionModal
        mode={actionOpen}
        user={me}
        balance={
          actionOpen === 'withdraw'
            ? (me?.earningsBalance ?? 0)
            : actionOpen === 'withdraw-referral'
            ? (me?.referralWalletBalance ?? 0)
            : (me?.walletBalance ?? 0)
        }
        onClose={() => setActionOpen(null)}
        onSuccess={() => load()}
      />

      {zoomImageUrl && (
        <ImageZoomOverlay url={zoomImageUrl} onClose={() => setZoomImageUrl(null)} />
      )}
    </div>
  );
}

/**
 * One row in the user's "Top-up history" / "Withdrawal history" list.
 * Status pill on the right; tappable thumbnail when a screenshot was
 * uploaded. Admin notes (e.g. rejection reason) render below if present.
 */
function WalletRequestRow({ r, onZoomImage }) {
  const isTopup = r.type === 'topup';
  const refOrUpi = isTopup ? r.referenceId : r.upiId;
  return (
    <li className="px-4 py-3.5 flex items-start gap-3">
      {r.qrUrl ? (
        <button
          type="button"
          onClick={() => onZoomImage(r.qrUrl)}
          className="w-12 h-12 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 shrink-0 hover:opacity-90 transition"
          aria-label="View screenshot"
        >
          <img
            src={r.qrUrl}
            alt={isTopup ? 'Payment screenshot' : 'UPI QR screenshot'}
            className="w-full h-full object-cover"
          />
        </button>
      ) : (
        <div className="w-12 h-12 rounded-xl border border-neutral-200 bg-neutral-50 grid place-items-center text-neutral-400 shrink-0">
          {isTopup ? <Plus size={16} /> : <ArrowDownToLine size={16} />}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-sm tabular-nums text-ink">
            ₹{fmtCredits(r.amount)}{' '}
            <span className="text-[11px] font-medium text-neutral-500">
              · {isTopup ? 'Top-up' : 'Withdrawal'}
            </span>
          </p>
          <RequestStatus status={r.status} />
        </div>

        {refOrUpi && (
          <p className="text-[11px] text-neutral-500 mt-0.5 break-all">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 mr-1">
              {isTopup ? 'Ref' : 'UPI'}
            </span>
            <span className="font-mono">{refOrUpi}</span>
          </p>
        )}

        <p className="text-[11px] text-neutral-400 mt-1">
          {fmtDate(r.createdAt)}
          {r.actionedAt && r.status !== 'pending' && (
            <span> · {r.status} {fmtDate(r.actionedAt)}</span>
          )}
        </p>

        {r.adminNote && r.status === 'rejected' && (
          <p className="mt-1 text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1">
            {r.adminNote}
          </p>
        )}
      </div>
    </li>
  );
}

function RequestStatus({ status }) {
  const cls =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'rejected'
      ? 'bg-rose-100 text-rose-700'
      : 'bg-amber-100 text-amber-700';
  return (
    <span
      className={`shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${cls}`}
    >
      {status}
    </span>
  );
}

/**
 * Tap-to-zoom overlay for the user's own uploaded screenshots in
 * the wallet-request history. Same idea as the admin QR zoom modal
 * but simpler since the URL is already public.
 */
function ImageZoomOverlay({ url, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full grid place-items-center bg-white/15 hover:bg-white/25 text-white transition"
      >
        <X size={18} />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="text-center max-w-md w-full">
        <img
          src={url}
          alt="Uploaded screenshot"
          className="w-full max-h-[80dvh] object-contain rounded-2xl bg-black/50"
        />
        <p className="text-white/50 text-xs mt-3">Tap anywhere to close</p>
      </div>
    </div>
  );
}

/**
 * Wallet/Earnings card with a primary action (Add credits / Withdraw).
 * Sits at the top of the billing page so the user gets balance + action
 * + lifetime stat in one tile.
 */
function BalanceActionCard({
  tone,
  label,
  balance,
  actionLabel,
  actionIcon,
  onAction,
  lifetimeLabel,
  lifetimeValue,
  lifetimeCount,
}) {
  const isEarnings = tone === 'earnings';
  const ringCls = isEarnings ? 'border-amber-200' : 'border-emerald-200';
  const iconBg = isEarnings
    ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  const balanceCls = isEarnings ? 'text-amber-700' : 'text-emerald-700';
  const btnCls = isEarnings
    ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30'
    : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30';

  return (
    <div className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-sm ${ringCls}`}>
      <div className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${iconBg}`}>
          <Wallet size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
          <p className={`text-2xl font-bold tabular-nums leading-tight ${balanceCls}`}>
            {fmtCredits(balance)}{' '}
            <span className="text-sm font-medium text-neutral-500">credits</span>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onAction}
        className={`mt-3 inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 text-sm font-bold rounded-full text-white shadow-md transition ${btnCls}`}
      >
        {actionIcon}
        {actionLabel}
      </button>

      <div className="mt-3 pt-3 border-t border-neutral-100 flex items-baseline justify-between text-[11px]">
        <span className="text-neutral-500">{lifetimeLabel}</span>
        <span className="font-bold tabular-nums text-ink">
          {fmtCredits(lifetimeValue)}{' '}
          <span className="font-medium text-neutral-500">
            · {lifetimeCount} call{lifetimeCount === 1 ? '' : 's'}
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * Add-credits / Withdraw modal. Both actions are admin-mediated for now
 * — there's no payment-gateway integration yet — so the modal explains
 * the manual flow and offers a contact CTA. We keep it as a single
 * component shared between the two flows; the copy + tone changes by
 * `mode`.
 */
/**
 * Add-credits / Withdraw modal. The two flows share a frame but have
 * distinct bodies: AddCreditsForm launches Razorpay checkout, and
 * WithdrawForm files a withdrawal request (UPI id + QR screenshot).
 */
function ActionModal({ mode, balance, onClose, onSuccess, user }) {
  if (!mode) return null;
  const isAdd = mode === 'add';
  const isReferralWithdraw = mode === 'withdraw-referral';
  const title = isAdd
    ? 'Add credits'
    : isReferralWithdraw
    ? 'Withdraw referral'
    : 'Withdraw earnings';
  const headerCls = isAdd
    ? 'bg-emerald-500 text-white'
    : 'bg-amber-500 text-white';

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
            {isAdd ? <Plus size={18} strokeWidth={2.4} /> : <ArrowDownToLine size={18} strokeWidth={2.4} />}
          </span>
          <h3 className="font-bold text-base flex-1">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/20 transition"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4">
          {isAdd ? (
            <AddCreditsDispatcher balance={balance} onClose={onClose} onSuccess={onSuccess} user={user} />
          ) : (
            <WithdrawForm
              balance={balance}
              source={isReferralWithdraw ? 'referral' : 'earnings'}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          )}
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/**
 * Lazy-load the Razorpay Checkout script the first time someone
 * actually pays. Caches the promise so subsequent payments skip the
 * network hit. Resolves once `window.Razorpay` is callable.
 */
function loadRazorpayCheckout() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.__rzpScriptPromise) return window.__rzpScriptPromise;
  window.__rzpScriptPromise = new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(s);
  });
  return window.__rzpScriptPromise;
}

/**
 * Tabbed wrapper for the Add-credits modal. Lets the user pick
 * between the instant Razorpay checkout (default) and the manual
 * QR + reference flow (admin-mediated). Both paths share the same
 * surrounding modal chrome — only the body switches.
 */
function AddCreditsDispatcher({ balance, onClose, onSuccess, user }) {
  // null while we load /wallet/payment-config; bool after.
  const [razorpayEnabled, setRazorpayEnabled] = useState(null);
  // tab is 'razorpay' | 'manual'; once we know the config it's
  // clamped to 'manual' when Razorpay is off.
  const [tab, setTab] = useState('razorpay');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/wallet/payment-config')
      .then((r) => {
        if (cancelled) return;
        const enabled = r.data?.razorpayEnabled !== false; // default ON
        setRazorpayEnabled(enabled);
        if (!enabled) setTab('manual');
      })
      .catch(() => {
        // Config fetch failed — fail-open to manual so the user can
        // still top up. They won't see the Razorpay tab until config
        // succeeds.
        if (!cancelled) {
          setRazorpayEnabled(false);
          setTab('manual');
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Loading state: render a small spinner so we don't briefly show
  // the Razorpay tab and then yank it away.
  if (razorpayEnabled === null) {
    return (
      <div className="py-10 grid place-items-center">
        <span className="w-7 h-7 rounded-full border-4 border-brand-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tab pill — only rendered when both options are available.
          With Razorpay off there's only one path (manual), so we
          skip the pill entirely. */}
      {razorpayEnabled && (
        <div className="inline-flex w-full p-1 rounded-full bg-neutral-100 border border-neutral-200">
          <button
            type="button"
            onClick={() => setTab('razorpay')}
            className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-full transition ${
              tab === 'razorpay'
                ? 'bg-tinder text-white shadow-sm'
                : 'text-neutral-500 hover:text-ink'
            }`}
          >
            Instant · Razorpay
          </button>
          <button
            type="button"
            onClick={() => setTab('manual')}
            className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-full transition ${
              tab === 'manual'
                ? 'bg-white text-ink shadow-sm'
                : 'text-neutral-500 hover:text-ink'
            }`}
          >
            QR + Reference
          </button>
        </div>
      )}

      {razorpayEnabled && tab === 'razorpay' ? (
        <AddCreditsRazorpayForm
          balance={balance}
          onClose={onClose}
          onSuccess={onSuccess}
          user={user}
        />
      ) : (
        <AddCreditsForm
          balance={balance}
          onClose={onClose}
          onSuccess={onSuccess}
          user={user}
        />
      )}
    </div>
  );
}

/**
 * Razorpay Checkout top-up flow:
 *   1. POST /wallet/order { amount }    → backend creates a Razorpay
 *      order + pending WalletRequest, returns the orderId / keyId.
 *   2. Load Razorpay's checkout.js + open its modal.
 *   3. On `handler(response)` Razorpay returns the signed payment
 *      payload; we POST /wallet/verify which HMAC-checks the
 *      signature and credits the wallet atomically.
 *   4. Refresh /users/me so the wallet pill updates immediately.
 *
 * Failure-mode handling: if /wallet/order fails (e.g. server returns
 * "Razorpay is not configured on this server"), we surface the
 * message and let the user fall back to the manual tab.
 */
function AddCreditsRazorpayForm({ balance, onClose, onSuccess, user }) {
  const [amount, setAmount] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const num = Number(amount) || 0;
  const canSubmit = num >= 1 && !submitting && !done;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (num < 1) return setError('Enter at least 1 credit');
    setSubmitting(true);
    try {
      // 1) Create the order server-side. Backend returns paise amount
      //    + Razorpay orderId + the public keyId for the checkout.
      const { data: order } = await api.post('/wallet/order', { amount: num });

      // 2) Lazy-load checkout.js (idempotent across re-opens).
      await loadRazorpayCheckout();

      // 3) Open Razorpay's hosted checkout. The `handler` callback is
      //    invoked once the user completes payment — the response
      //    carries the signed fields we need to verify.
      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'callnade',
        description: `Top up ${num} credits`,
        prefill: {
          email: user?.email || undefined,
          name: user?.displayName || user?.username || undefined,
          contact: user?.phone || undefined,
        },
        theme: { color: '#ec4899' },
        handler: async (response) => {
          try {
            const { data: verified } = await api.post('/wallet/verify', {
              walletRequestId: order.walletRequestId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            // 4) Refresh balance in the auth store so the wallet
            //    pill picks up the new value without a full reload.
            //    /users/me returns `{ user, avatar, gallery }` — the
            //    inner `.user` is what setUser expects; passing the
            //    whole envelope nukes username/displayName and
            //    crashes HomeSidebar.
            try {
              const { data } = await api.get('/users/me');
              const fresh = data?.user || data;
              const current = useAuthStore.getState().user;
              useAuthStore.getState().setUser({ ...current, ...fresh });
            } catch { /* non-fatal */ }
            setDone(true);
            onSuccess?.(verified);
            setTimeout(() => onClose?.(), 1100);
          } catch (err) {
            setError(err.message || 'Payment verification failed');
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
      });
      rzp.open();
    } catch (err) {
      setError(err.message || 'Could not open Razorpay');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl bg-brand-50 border border-brand-100 p-4 text-[12px] text-brand-700">
        Pay instantly via Razorpay — UPI, cards, wallets, net banking. Your
        wallet is credited the moment payment clears.
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
          Amount (credits)
        </span>
        <input
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={submitting || done}
          className="px-4 py-2.5 text-sm rounded-2xl border border-neutral-300 focus:outline-none focus:border-ink focus:ring-2 focus:ring-black/10 transition disabled:opacity-50"
        />
        <small className="text-[11px] text-neutral-500">
          Current balance · {fmtCredits(balance)} credits
        </small>
      </label>

      <div className="grid grid-cols-3 gap-2">
        {[100, 500, 1000].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(v)}
            disabled={submitting || done}
            className="px-3 py-2 text-sm font-semibold rounded-full border border-neutral-200 hover:border-tinder hover:text-tinder transition disabled:opacity-50"
          >
            ₹{v}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="px-3 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}
      {done && (
        <div className="px-3 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 inline-flex items-center gap-2">
          <Check size={14} /> Payment received — wallet topped up.
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full px-5 py-3 text-sm font-bold rounded-full text-white bg-tinder shadow-md shadow-tinder/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {submitting ? 'Opening Razorpay…' : `Pay ₹${num || 0} via Razorpay`}
      </button>
    </form>
  );
}

/**
 * Add-credits flow (manual reconciliation):
 *   1) Show the merchant QR (tap to zoom) + merchant UPI ID with a
 *      copy button.
 *   2) User pays from their own UPI app by scanning the QR or sending
 *      to the UPI ID.
 *   3) User pastes the UPI reference (UTR/RRN) from their bank app
 *      into the form.
 *   4) Submit → POST /wallet/topup. The request lands as `pending`
 *      and an admin verifies the reference against the collection
 *      account before crediting the wallet.
 */
function AddCreditsForm({ balance, onClose, onSuccess }) {
  const [amount, setAmount] = useState(100);
  const [referenceId, setReferenceId] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  // Pick one QR from the admin-managed pool on mount. Stable for the
  // life of this form so a user doesn't see the QR change while
  // they're typing; refreshed on the next time the modal opens.
  const [qrUrl, setQrUrl] = useState(PAYMENT_QR_FALLBACK);
  const [qrUpiId, setQrUpiId] = useState(MERCHANT_UPI_ID);
  // `qrLoading` covers BOTH the API fetch (resolving which QR to
  // show) and the image load (decoding the bytes from R2/CDN). Stays
  // true until the <img> emits onLoad — only then do we unhide it.
  const [qrLoading, setQrLoading] = useState(true);
  // Brief ✓ flash on the Copy button for confirmation.
  const [upiCopied, setUpiCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .get('/wallet/payment-qr')
      .then((r) => {
        if (cancelled) return;
        if (r.data?.url && r.data.url !== qrUrl) {
          // Swap to the picked URL — keep the loader on so the user
          // sees the spinner until the new image is fully decoded.
          setQrLoading(true);
          setQrUrl(r.data.url);
        }
        if (r.data?.upiId) setQrUpiId(r.data.upiId);
      })
      .catch(() => {
        /* keep the hardcoded fallback (and let it load) */
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const screenshotInput = useRef(null);

  // Revoke the preview blob URL when the file changes / unmounts so
  // we don't leak object URLs.
  useEffect(() => {
    return () => {
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    };
  }, [screenshotPreview]);

  const onScreenshot = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Screenshot must be a JPEG, PNG, or WebP image');
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setError('Screenshot too large (max 4MB)');
      return;
    }
    setError(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotFile(f);
    setScreenshotPreview(URL.createObjectURL(f));
  };

  const num = Number(amount) || 0;
  const ref = referenceId.trim();
  const refLooksValid = ref.length >= 6 && ref.length <= 64 && /^[A-Za-z0-9_\-]+$/.test(ref);
  const canSubmit = num >= 1 && refLooksValid && !submitting && !done;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (num < 1) {
      setError('Enter at least 1 credit');
      return;
    }
    if (!refLooksValid) {
      setError('Reference id should be 6–64 letters/digits');
      return;
    }
    setSubmitting(true);
    try {
      if (screenshotFile) {
        // Image-upload variant: raw bytes in body, fields in the
        // query string (matches /wallet/withdraw + /media/upload).
        const buf = await screenshotFile.arrayBuffer();
        await api.post('/wallet/topup', buf, {
          params: {
            amount: num,
            referenceId: ref,
          },
          headers: { 'Content-Type': screenshotFile.type },
          transformRequest: [(d) => d], // skip JSON serialization
        });
      } else {
        await api.post('/wallet/topup', {
          amount: num,
          referenceId: ref,
        });
      }
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-3">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-100 grid place-items-center text-emerald-700">
          <Check size={26} strokeWidth={2.4} />
        </div>
        <p className="font-bold text-base">Top-up submitted</p>
        <p className="text-sm text-neutral-500 mt-1 max-w-[18rem] mx-auto">
          We'll match your reference{' '}
          <span className="font-mono text-ink">{ref}</span> against the
          collection account and credit your wallet shortly.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 px-5 py-2.5 text-sm font-bold rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/30 hover:bg-emerald-600 transition"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-3">
        {/* Big tappable QR. The "tap to expand" affordance keeps the
            modal compact while letting the user zoom in for scanning
            from a second device or for a clearer view. */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <button
            type="button"
            onClick={() => setZoomed(true)}
            disabled={qrLoading}
            className="relative block w-full group"
            aria-label="Expand QR"
          >
            {/* Reserved-aspect square so the layout doesn't reflow when
                the image arrives. The loader sits centered behind the
                image; the image fades in over it via opacity transition
                once it's decoded. */}
            <div className="relative w-full max-w-[260px] mx-auto aspect-square rounded-xl bg-neutral-50 border border-neutral-200 overflow-hidden">
              {qrLoading && (
                <div className="absolute inset-0 grid place-items-center text-neutral-400">
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className="w-9 h-9 rounded-full border-[3px] border-emerald-200 border-t-emerald-500 animate-spin"
                      aria-hidden="true"
                    />
                    <span className="text-[11px] font-semibold text-neutral-500">
                      Loading QR…
                    </span>
                  </div>
                </div>
              )}
              <img
                src={qrUrl}
                alt="callnade payment QR"
                onLoad={() => setQrLoading(false)}
                onError={() => setQrLoading(false)}
                className={`w-full h-full object-contain transition-opacity duration-200 ${
                  qrLoading ? 'opacity-0' : 'opacity-100'
                }`}
              />
            </div>
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition">
              Tap to expand
            </span>
          </button>
          {/* UPI ID associated with this particular QR — picked from
              the admin pool. Mono pill on the left, dedicated Copy
              button on the right with a ✓ flash on success. */}
          {qrUpiId && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200">
                <span className="text-[10px] uppercase tracking-wide font-bold text-neutral-500 shrink-0">
                  UPI ID
                </span>
                <code className="font-mono text-sm text-ink truncate min-w-0">
                  {qrUpiId}
                </code>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(qrUpiId);
                    setUpiCopied(true);
                    setTimeout(() => setUpiCopied(false), 1500);
                  } catch {
                    /* clipboard blocked — silent */
                  }
                }}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm transition shrink-0"
              >
                {upiCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-3.5">
          <p className="text-[11px] uppercase tracking-wide font-bold text-neutral-500">
            Wallet balance
          </p>
          <p className="text-2xl font-bold tabular-nums text-ink mt-0.5">
            {fmtCredits(balance)}{' '}
            <span className="text-sm font-medium text-neutral-500">credits</span>
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
            Amount (1 credit = ₹1)
          </span>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-semibold">
              ₹
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pl-8 pr-4 py-2.5 text-sm rounded-full bg-white border border-neutral-300 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition tabular-nums"
              placeholder="100"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[100, 250, 500, 1000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(v)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition ${
                  Number(amount) === v
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                ₹{v}
              </button>
            ))}
          </div>
        </label>


        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
            UPI reference / transaction id
          </span>
          <input
            type="text"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder="e.g. 412345678901"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full px-4 py-2.5 text-sm rounded-full bg-white border border-neutral-300 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition font-mono tabular-nums"
          />
          <span className="text-[11px] text-neutral-500 leading-snug">
            After paying, copy the UTR / reference number from your bank
            app's transaction details and paste it here so the admin can
            match the payment.
          </span>
        </label>

        {/* Payment screenshot — optional but really speeds up review.
            Same uploader pattern as the withdraw form for consistency. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
            Payment screenshot{' '}
            <span className="text-neutral-400 normal-case font-medium">(optional)</span>
          </span>
          <input
            ref={screenshotInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onScreenshot}
            hidden
          />
          {screenshotPreview ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 flex items-center gap-3">
              <img
                src={screenshotPreview}
                alt="Payment screenshot preview"
                className="w-20 h-20 rounded-xl object-cover bg-white border border-neutral-200 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">
                  {screenshotFile.name}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {(screenshotFile.size / 1024).toFixed(0)} KB
                </p>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => screenshotInput.current?.click()}
                    className="text-emerald-700 hover:underline"
                  >
                    Replace
                  </button>
                  <span className="text-neutral-300">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
                      setScreenshotFile(null);
                      setScreenshotPreview(null);
                    }}
                    className="text-neutral-500 hover:text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => screenshotInput.current?.click()}
              className="rounded-2xl border-2 border-dashed border-neutral-300 hover:border-emerald-300 hover:bg-emerald-50/40 p-4 text-center transition"
            >
              <Upload size={18} className="mx-auto text-neutral-500" />
              <p className="text-xs font-semibold text-neutral-700 mt-1">
                Tap to upload payment screenshot
              </p>
              <p className="text-[10px] text-neutral-500 mt-0.5">
                JPEG, PNG, or WebP · up to 4MB
              </p>
            </button>
          )}
        </div>

        {error && (
          <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-1.5">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 text-sm font-bold rounded-full text-white bg-emerald-500 shadow-md shadow-emerald-500/30 hover:bg-emerald-600 disabled:opacity-50 transition"
        >
          <Plus size={14} strokeWidth={2.6} />
          {submitting ? 'Submitting…' : 'Submit top-up'}
        </button>

        <p className="text-[10px] text-neutral-400 text-center leading-relaxed">
          Pay first via UPI by scanning the QR above, then submit the
          reference. An admin will verify and credit your wallet.
        </p>
      </form>

      {zoomed && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center p-4 bg-black/90"
          onClick={() => setZoomed(false)}
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Close QR"
            className="absolute top-4 right-4 w-10 h-10 rounded-full grid place-items-center bg-white/15 hover:bg-white/25 text-white transition"
          >
            <X size={18} />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="text-center max-w-md w-full">
            <img
              src={qrUrl}
              alt="callnade payment QR"
              className="w-full rounded-2xl bg-white p-4 shadow-2xl"
            />
            <p className="text-white text-sm font-semibold mt-3">{MERCHANT_NAME}</p>
            <p className="text-white/70 font-mono text-sm mt-0.5">{qrUpiId}</p>
            <p className="text-white/50 text-xs mt-3">Tap anywhere to close</p>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Withdraw flow:
 *   - Amount (capped to current earnings balance).
 *   - UPI id (basic format check on the server).
 *   - QR screenshot upload (raw bytes — same pattern as /media/upload).
 *
 * On submit, we POST /wallet/withdraw which records the request as
 * `pending`. An admin actions it from the admin panel.
 */
function WithdrawForm({ balance, source = 'earnings', onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [qrFile, setQrFile] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const fileInput = useRef(null);

  // Revoke the object URL when the file changes / unmounts so we don't
  // leak blobs.
  useEffect(() => {
    return () => {
      if (qrPreview) URL.revokeObjectURL(qrPreview);
    };
  }, [qrPreview]);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('QR must be a JPEG, PNG, or WebP image');
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setError('QR image too large (max 4MB)');
      return;
    }
    setError(null);
    if (qrPreview) URL.revokeObjectURL(qrPreview);
    setQrFile(f);
    setQrPreview(URL.createObjectURL(f));
  };

  const num = Number(amount) || 0;
  const canSubmit =
    num > 0 &&
    num <= balance &&
    !!upiId.trim() &&
    !!qrFile &&
    !submitting &&
    !done;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // POST /wallet/withdraw — raw image bytes in body, amount +
      // upiId + source in query string. Source decides which wallet
      // gets debited on admin approval ('earnings' or 'referral').
      const buf = await qrFile.arrayBuffer();
      await api.post('/wallet/withdraw', buf, {
        params: { amount: num, upiId: upiId.trim(), source },
        headers: { 'Content-Type': qrFile.type },
        transformRequest: [(d) => d], // skip JSON serialization
      });
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-3">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-100 grid place-items-center text-amber-700">
          <Check size={26} strokeWidth={2.4} />
        </div>
        <p className="font-bold text-base">Withdrawal requested</p>
        <p className="text-sm text-neutral-500 mt-1 max-w-[18rem] mx-auto">
          An admin will review and pay out to <span className="font-mono">{upiId.trim()}</span> shortly.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 px-5 py-2.5 text-sm font-bold rounded-full bg-amber-500 text-white shadow-md shadow-amber-500/30 hover:bg-amber-600 transition"
        >
          Done
        </button>
      </div>
    );
  }

  // Platform fee on creator earnings (20%). Referral wallet
  // withdrawals are full payout — keep the constant aligned with the
  // backend's WITHDRAW_FEE_RATE_* values.
  const feeRate = source === 'referral' ? 0 : 0.2;
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const grossNum = Math.max(0, num);
  const fee = r2(grossNum * feeRate);
  const netPayout = r2(grossNum - fee);

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-3.5">
        <p className="text-[11px] uppercase tracking-wide font-bold text-neutral-500">
          {source === 'referral' ? 'Referral wallet' : 'Earnings balance'}
        </p>
        <p className="text-2xl font-bold tabular-nums text-ink mt-0.5">
          {fmtCredits(balance)}{' '}
          <span className="text-sm font-medium text-neutral-500">credits</span>
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-neutral-700">
          Amount to withdraw
          <button
            type="button"
            onClick={() => setAmount(String(balance))}
            className="text-[10px] text-amber-700 normal-case font-semibold hover:underline"
          >
            Use max
          </button>
        </span>
        <input
          type="number"
          min={1}
          step={1}
          max={balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-full px-4 py-2.5 text-sm rounded-full bg-white border border-neutral-300 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition tabular-nums"
        />
        {num > 0 && num > balance && (
          <span className="text-[11px] text-rose-600">
            Amount exceeds {source === 'referral' ? 'referral wallet' : 'earnings'} balance.
          </span>
        )}
      </label>

      {/* Fee breakdown — only for earnings withdrawals (referral
          wallet has no fee). Surfaces what the user actually receives
          so there's no surprise on payout. */}
      {feeRate > 0 && grossNum > 0 && grossNum <= balance && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-amber-800">Withdrawing</span>
            <span className="font-bold tabular-nums text-amber-900">
              ₹{fmtCredits(grossNum)}
            </span>
          </div>
          <div className="flex items-center justify-between text-amber-700">
            <span>Platform fee ({Math.round(feeRate * 100)}%)</span>
            <span className="font-semibold tabular-nums">−₹{fmtCredits(fee)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-amber-200">
            <span className="font-bold text-amber-900">You'll receive</span>
            <span className="text-base font-bold tabular-nums text-amber-900">
              ₹{fmtCredits(netPayout)}
            </span>
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
          UPI id
        </span>
        <input
          type="text"
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          placeholder="yourname@bank"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="w-full px-4 py-2.5 text-sm rounded-full bg-white border border-neutral-300 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition font-mono"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">
          UPI QR screenshot
        </span>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFile}
          hidden
        />
        {qrPreview ? (
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 flex items-center gap-3">
            <img
              src={qrPreview}
              alt="UPI QR preview"
              className="w-20 h-20 rounded-xl object-contain bg-white border border-neutral-200 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink truncate">{qrFile.name}</p>
              <p className="text-[11px] text-neutral-500">
                {(qrFile.size / 1024).toFixed(0)} KB
              </p>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="mt-1.5 text-[11px] font-semibold text-amber-700 hover:underline"
              >
                Replace
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-2xl border-2 border-dashed border-neutral-300 hover:border-amber-300 hover:bg-amber-50/40 p-4 text-center transition"
          >
            <Upload size={18} className="mx-auto text-neutral-500" />
            <p className="text-xs font-semibold text-neutral-700 mt-1">
              Tap to upload QR
            </p>
            <p className="text-[10px] text-neutral-500 mt-0.5">
              JPEG, PNG, or WebP · up to 4MB
            </p>
          </button>
        )}
      </div>

      {error && (
        <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-1.5">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 text-sm font-bold rounded-full text-white bg-amber-500 shadow-md shadow-amber-500/30 hover:bg-amber-600 disabled:opacity-50 transition"
      >
        <ArrowDownToLine size={14} strokeWidth={2.6} />
        {submitting ? 'Submitting…' : 'Submit withdrawal'}
      </button>

      <p className="text-[10px] text-neutral-400 text-center leading-relaxed">
        We'll review the request and pay out manually. Earnings stay in
        your balance until the admin marks it paid.
      </p>
    </form>
  );
}

function FilterChip({ active, onClick, tone, children }) {
  const activeCls =
    tone === 'emerald'
      ? 'bg-emerald-500 text-white border-emerald-500'
      : tone === 'rose'
      ? 'bg-rose-500 text-white border-rose-500'
      : 'bg-ink text-white border-ink';
  const idleCls = 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border font-semibold transition ${
        active ? activeCls : idleCls
      }`}
    >
      {children}
    </button>
  );
}

function TransactionRow({ t }) {
  const isIn = t.direction === 'incoming';
  const isReferral = t.kind === 'referral';
  const sign = isIn ? '+' : '−';
  const valueCls = isIn ? 'text-emerald-700' : 'text-rose-700';
  // Referral payouts get a slightly different visual so they don't
  // blur into call-incoming rows: amber tint instead of emerald, and
  // a "REFERRAL" label in place of "INCOMING".
  const iconBg = isReferral
    ? 'bg-amber-100 text-amber-700'
    : isIn
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700';
  const Icon = isReferral ? Wallet : isIn ? PhoneIncoming : PhoneOutgoing;

  const peer = t.peer;
  const peerName = peer?.displayName || peer?.username || 'Unknown';

  return (
    <li className="px-4 py-3.5 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${iconBg}`}>
        <Icon size={17} strokeWidth={1.8} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="font-semibold text-sm truncate">
            {peer?.username ? (
              <Link to={`/u/${peer.username}`} className="hover:underline">
                {peerName}
              </Link>
            ) : (
              <span>{peerName}</span>
            )}
          </p>
          <span
            className={`text-[10px] font-bold uppercase tracking-wide shrink-0 ${
              isReferral ? 'text-amber-700' : 'text-neutral-500'
            }`}
          >
            {isReferral ? 'Referral' : isIn ? 'Incoming' : 'Outgoing'}
          </span>
        </div>
        {isReferral ? (
          <p className="mt-0.5 text-[11px] text-neutral-500">
            10% from {peer?.username ? `@${peer.username}'s` : 'a friend\'s'} top-up
          </p>
        ) : (
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-neutral-500">
            <span>{fmtDuration(t.durationSec)}</span>
            {t.perMinuteRate > 0 && (
              <>
                <span>·</span>
                <span>{fmtCredits(t.perMinuteRate)} cr/min</span>
              </>
            )}
            {t.endReason && t.endReason !== 'hangup' && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5 text-rose-500">
                  <PhoneOff size={10} /> {humanReason(t.endReason)}
                </span>
              </>
            )}
          </div>
        )}
        <p className="text-[11px] text-neutral-400 mt-1">{fmtDate(t.at)}</p>
      </div>

      <p className={`text-base sm:text-lg font-bold tabular-nums shrink-0 ${valueCls}`}>
        {sign}
        {fmtCredits(t.amount)}
      </p>
    </li>
  );
}

function EmptyState({ filter }) {
  const text =
    filter === 'incoming'
      ? "You haven't received any payments yet."
      : filter === 'outgoing'
      ? "You haven't paid for any calls yet."
      : 'No transactions yet — they show up here once you start calling.';
  return (
    <div className="text-center py-16">
      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-brand-100 grid place-items-center text-brand-500">
        <Wallet size={22} strokeWidth={1.8} />
      </div>
      <p className="text-sm text-neutral-500 max-w-xs mx-auto">{text}</p>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtDuration(sec) {
  const s = Number(sec) || 0;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function humanReason(r) {
  switch (r) {
    case 'rejected': return 'rejected';
    case 'missed': return 'missed';
    case 'error': return 'errored';
    case 'insufficient_credits': return 'out of credits';
    default: return r;
  }
}
