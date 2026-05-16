import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, Shield, Ban, RotateCcw, Video, Wallet, FileText, Trash2,
  Check, X, Pencil, ArrowDownUp,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';
import AdminUserDetailModal from '../components/AdminUserDetailModal.jsx';
import { fmtCredits } from '../utils/formatCredits.js';

export default function Admin() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [activeCalls, setActiveCalls] = useState([]);
  const [detailUserId, setDetailUserId] = useState(null);
  // Per-row edit mode: only one row can have its action panel open at a
  // time. Tapping another row's pencil collapses the previous one.
  const [editingId, setEditingId] = useState(null);
  // 'newest' first (default) | 'oldest' first.
  const [sort, setSort] = useState('newest');
  const debounceRef = useRef(null);

  const callMap = activeCalls.reduce((acc, c) => {
    if (c.caller?.id) acc[c.caller.id] = { peer: c.callee, state: c.state, callId: c.callId };
    if (c.callee?.id) acc[c.callee.id] = { peer: c.caller, state: c.state, callId: c.callId };
    return acc;
  }, {});

  useEffect(() => {
    const load = () => {
      api.get('/admin/calls/active').then((r) => setActiveCalls(r.data.items || [])).catch(() => {});
    };
    load();
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const load = async (nextCursor) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/users', {
        params: {
          cursor: nextCursor || undefined,
          q: debouncedQuery || undefined,
          sort,
        },
      });
      setItems((prev) => (nextCursor ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, sort]);

  const ban = async (userId) => {
    if (!confirm('Ban this user? They will be logged out and unable to sign in.')) return;
    setBusy(userId);
    try {
      await api.post(`/admin/users/${userId}/ban`);
      setItems((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, banned: true, bannedAt: new Date().toISOString() } : u)),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const unban = async (userId) => {
    setBusy(userId);
    try {
      await api.post(`/admin/users/${userId}/unban`);
      setItems((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, banned: false, bannedAt: null } : u)),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const softDelete = async (userId, username) => {
    if (!confirm(`Delete @${username}? They'll be logged out, hidden from every public list, and unable to log in. You can restore them later.`)) return;
    setBusy(userId);
    try {
      const { data } = await api.post(`/admin/users/${userId}/soft-delete`);
      setItems((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, deletedAt: data.deletedAt } : u)),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const restore = async (userId) => {
    setBusy(userId);
    try {
      await api.post(`/admin/users/${userId}/restore`);
      setItems((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, deletedAt: null } : u)),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const adjustWallet = async (userId, delta) => {
    try {
      const { data } = await api.post(`/admin/users/${userId}/wallet`, { delta });
      setItems((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, walletBalance: data.walletBalance } : u)),
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const adjustEarnings = async (userId, delta) => {
    try {
      const { data } = await api.post(`/admin/users/${userId}/earnings`, { delta });
      setItems((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, earningsBalance: data.earningsBalance } : u)),
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const setRole = async (userId, role) => {
    try {
      await api.post(`/admin/users/${userId}/role`, { role });
      setItems((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role, isAdmin: role === 'admin' } : u)),
      );
    } catch (err) {
      setError(err.message);
    }
  };

  // Flip a creator's playback-video flag. When on, that creator's
  // outgoing video on the next call is the shared pre-recorded clip
  // (frontend constant) instead of their live camera. Admin-only.
  const togglePlaybackVideo = async (userId, current) => {
    const next = !current;
    // Optimistic — flip locally so the chip color changes immediately.
    setItems((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, usePlaybackVideo: next } : u)),
    );
    try {
      await api.patch(`/admin/users/${userId}/playback-video`, { enabled: next });
    } catch (err) {
      setError(err.message);
      // Revert on failure.
      setItems((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, usePlaybackVideo: current } : u)),
      );
    }
  };

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-neutral-950 text-ink">
      <HomeSidebar
        me={me}
        onLogout={async () => {
          try { await api.post('/auth/logout'); } catch {}
          useAuthStore.getState().clear();
          window.location.href = '/login';
        }}
      />

      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#fff5f9]">
        <MobileTopBar />
        <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 shrink-0">
          <div className="flex items-start gap-3 mb-3 flex-wrap sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
                <Shield size={22} className="text-brand-500" /> Admin
              </h1>
              <p className="text-sm text-neutral-500 mt-0.5">All accounts on callnade</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/admin/wallet-requests"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 transition"
              >
                <Wallet size={13} /> <span className="hidden sm:inline">Wallet</span>
              </Link>
              <Link
                to="/admin/payment-qrs"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 transition"
              >
                <FileText size={13} /> <span className="hidden sm:inline">QRs</span>
              </Link>
              <Link
                to="/admin/visits"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 transition"
              >
                📊 <span className="hidden sm:inline">Visits</span>
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2 max-w-2xl">
            <div className="relative flex-1 min-w-0">
              <Search
                size={16}
                strokeWidth={1.8}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, handle or email"
                className="w-full pl-9 pr-4 py-2 text-sm rounded-full bg-white/80 backdrop-blur-md border border-white/80 focus:outline-none focus:bg-white focus:border-brand-300 focus:ring-2 focus:ring-brand-100 transition"
              />
            </div>
            <button
              type="button"
              onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
              title={sort === 'newest' ? 'Showing newest first — tap to switch to oldest' : 'Showing oldest first — tap to switch to newest'}
              aria-label="Toggle sort order"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 transition shrink-0"
            >
              <ArrowDownUp size={13} />
              <span className="hidden sm:inline">{sort === 'newest' ? 'Newest' : 'Oldest'}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-24 lg:pb-8">
          <RazorpayToggle />
          {error && (
            <div className="px-4 py-2.5 mb-4 bg-rose-50 border border-rose-100 text-rose-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <h2 className="text-sm font-semibold text-neutral-700 mb-2 flex items-center gap-2">
            All accounts
            {(() => {
              const live = activeCalls.filter((c) => c.state === 'connected').length;
              if (!live) return null;
              return (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
                    <span className="relative w-2 h-2 rounded-full bg-emerald-500" />
                  </span>
                  {live} in call
                </span>
              );
            })()}
          </h2>

          {loading && items.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-12">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-12">No users match.</p>
          ) : (
            <ul className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
              {items.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-col gap-3 px-4 py-3.5 hover:bg-neutral-50 lg:flex-row lg:items-center"
                >
                  <Link
                    to={`/u/${u.username}`}
                    className="flex items-center gap-3 min-w-0 flex-1"
                  >
                    <div className="relative shrink-0">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className={`w-11 h-11 rounded-full object-cover ${u.banned || u.deletedAt ? 'opacity-40 grayscale' : ''}`} />
                      ) : (
                        <div className={`w-11 h-11 rounded-full bg-tinder grid place-items-center text-white font-semibold ${u.banned || u.deletedAt ? 'opacity-40 grayscale' : ''}`}>
                          {(u.displayName || u.username || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      {u.online && !u.banned && !u.deletedAt && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold text-sm truncate ${u.banned || u.deletedAt ? 'text-neutral-400 line-through' : ''}`}>
                          {u.displayName || u.username}
                        </p>
                        {callMap[u.id] && (() => {
                          const cm = callMap[u.id];
                          const isConnected = cm.state === 'connected';
                          const styles = isConnected
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200';
                          const dot = isConnected ? 'bg-emerald-500' : 'bg-amber-500';
                          const label = isConnected ? 'IN CALL' : 'RINGING';
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!isConnected) return; // can't spectate a ringing call
                                nav(`/admin/call/${cm.callId}/spectate`);
                              }}
                              title={isConnected ? 'Open admin monitor for this call' : 'Call is ringing — wait for it to connect'}
                              disabled={!isConnected}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full transition ${styles} ${
                                isConnected ? 'cursor-pointer' : 'cursor-default'
                              }`}
                            >
                              <span className="relative flex w-1.5 h-1.5">
                                <span className={`absolute inset-0 rounded-full ${dot} animate-ping opacity-75`} />
                                <span className={`relative w-1.5 h-1.5 rounded-full ${dot}`} />
                              </span>
                              <Video size={10} fill="currentColor" />
                              {label}
                              <span className="opacity-75">@{cm.peer?.username}</span>
                            </button>
                          );
                        })()}
                        <RoleChip role={u.role} />
                        {u.banned && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-600">
                            BANNED
                          </span>
                        )}
                        {u.deletedAt && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-neutral-200 text-neutral-700">
                            DELETED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 truncate">@{u.username} · {u.email}</p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {u.followerCount} subscribers · joined {fmt(u.createdAt)}
                      </p>
                    </div>
                  </Link>

                  {/* Edit toggle — collapsed by default, expanded only
                      when the admin taps the pencil. Keeps the list
                      scannable; full controls (Wallet/Earnings adjust,
                      role select, Ban, Delete, view details) only show
                      while editing this row. */}
                  {editingId === u.id ? (
                    <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {u.role !== 'provider' && (
                          <WalletControl
                            icon="wallet"
                            label="Wallet"
                            value={u.walletBalance ?? 0}
                            onChange={(delta) => adjustWallet(u.id, delta)}
                          />
                        )}
                        {(u.role === 'provider' || u.role === 'admin') && (
                          <WalletControl
                            icon="earnings"
                            label="Earnings"
                            value={u.earningsBalance ?? 0}
                            onChange={(delta) => adjustEarnings(u.id, delta)}
                          />
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDetailUserId(u.id)}
                        title="View verification photo & consent record"
                        aria-label="View user details"
                        className="w-9 h-9 grid place-items-center rounded-full border border-neutral-200 text-neutral-600 hover:text-ink hover:bg-neutral-50 transition shrink-0"
                      >
                        <FileText size={14} />
                      </button>

                      {u.id !== me?._id && (
                        <select
                          value={u.role || 'user'}
                          onChange={(e) => setRole(u.id, e.target.value)}
                          className="text-xs rounded-lg border border-neutral-200 px-2 py-1.5 shrink-0 bg-white"
                        >
                          <option value="user">User</option>
                          <option value="provider">Provider</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}

                      {/* Playback-video toggle — provider-only. When
                          on, the creator's next call publishes the
                          shared playback clip instead of their live
                          camera. Pink-filled when active. */}
                      {u.role === 'provider' && (
                        <button
                          type="button"
                          onClick={() => togglePlaybackVideo(u.id, !!u.usePlaybackVideo)}
                          title={
                            u.usePlaybackVideo
                              ? 'Playback video ON — disable to use live camera'
                              : 'Use shared playback video on next call'
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-full transition shrink-0 ${
                            u.usePlaybackVideo
                              ? 'bg-tinder text-white shadow-md shadow-tinder/30'
                              : 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                          }`}
                        >
                          <Video size={13} /> {u.usePlaybackVideo ? 'Playback ON' : 'Playback'}
                        </button>
                      )}

                      {u.id !== me?._id && u.role !== 'admin' && (
                        u.banned ? (
                          <button
                            onClick={() => unban(u.id)}
                            disabled={busy === u.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-neutral-200 hover:bg-neutral-50 disabled:opacity-50 transition shrink-0"
                          >
                            <RotateCcw size={13} /> Unban
                          </button>
                        ) : (
                          <button
                            onClick={() => ban(u.id)}
                            disabled={busy === u.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition shrink-0"
                          >
                            <Ban size={13} /> Ban
                          </button>
                        )
                      )}

                      {u.id !== me?._id && u.role !== 'admin' && (
                        u.deletedAt ? (
                          <button
                            onClick={() => restore(u.id)}
                            disabled={busy === u.id}
                            title={`Deleted ${fmt(u.deletedAt)}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition shrink-0"
                          >
                            <RotateCcw size={13} /> Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => softDelete(u.id, u.username)}
                            disabled={busy === u.id}
                            title="Soft-delete this account (hides from public, restorable)"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border border-neutral-200 text-neutral-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50 transition shrink-0"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        title="Done"
                        aria-label="Close edit mode"
                        className="w-9 h-9 grid place-items-center rounded-full bg-ink text-white hover:bg-neutral-800 transition shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingId(u.id)}
                      title="Edit user"
                      aria-label="Edit user"
                      className="w-9 h-9 grid place-items-center rounded-full border border-neutral-200 text-neutral-600 hover:text-ink hover:bg-neutral-50 transition shrink-0 self-end lg:self-auto"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {cursor && (
            <div className="mt-6 text-center">
              <button
                onClick={() => load(cursor)}
                disabled={loading}
                className="px-4 py-2 text-sm rounded-lg border border-neutral-200 hover:bg-neutral-50 transition disabled:opacity-50"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </main>
      <HomeBottomBar />

      {detailUserId && (
        <AdminUserDetailModal
          userId={detailUserId}
          onClose={() => setDetailUserId(null)}
        />
      )}
    </div>
  );
}

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function WalletControl({ icon = 'wallet', label = 'Wallet', value, onChange }) {
  // The input holds the desired NEW absolute balance. Defaults to the
  // current balance so the admin sees what they're editing. On ✓ we
  // diff against `value` and dispatch the delta to the existing
  // /admin/users/:id/wallet endpoint (which is delta-based).
  const [amount, setAmount] = useState(String(value ?? 0));
  const [busy, setBusy] = useState(false);
  const isEarnings = icon === 'earnings';

  // Re-sync if the parent's value changes (e.g. after a successful save
  // or socket push from a live billing tick).
  useEffect(() => {
    setAmount(String(value ?? 0));
  }, [value]);

  const parsed = parseFloat(amount);
  const dirty = Number.isFinite(parsed) && parsed >= 0 && parsed !== Number(value);

  const apply = async () => {
    if (!dirty) return;
    const delta = round2(parsed - Number(value));
    setBusy(true);
    try {
      await onChange(delta);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setAmount(String(value ?? 0));
  };

  return (
    <div className="flex items-center gap-1">
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg border ${
          isEarnings
            ? 'bg-amber-50 text-amber-700 border-amber-100'
            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
        }`}
        title={`Edit ${label} balance`}
      >
        <Wallet size={10} strokeWidth={2.2} />
        {label}
      </span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        className={`w-20 px-2 py-1 text-[12px] tabular-nums rounded-lg border focus:outline-none transition ${
          dirty
            ? isEarnings
              ? 'border-amber-300 bg-amber-50 focus:border-amber-400'
              : 'border-emerald-300 bg-emerald-50 focus:border-emerald-400'
            : 'border-neutral-200 focus:border-brand-300'
        }`}
      />
      <button
        type="button"
        onClick={apply}
        disabled={busy || !dirty}
        aria-label={`Save ${label}`}
        title={dirty ? `Set ${label} to ${parsed}` : `${label} unchanged`}
        className={`w-6 h-6 grid place-items-center rounded-lg text-white disabled:opacity-40 ${
          isEarnings ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'
        }`}
      >
        <Check size={11} strokeWidth={2.8} />
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={busy || !dirty}
        aria-label={`Cancel ${label} edit`}
        title="Discard edit"
        className="w-6 h-6 grid place-items-center rounded-lg bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40"
      >
        <X size={11} strokeWidth={2.8} />
      </button>
    </div>
  );
}

// Same 2-decimal rounding used backend-side. Keeps deltas clean despite
// floating-point math when the admin types fractional values.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function RoleChip({ role }) {
  const r = role || 'user';
  const styles = {
    admin: { bg: 'bg-brand-100', text: 'text-brand-600', label: 'ADMIN' },
    provider: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'PROVIDER' },
    user: { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'USER' },
  }[r];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${styles.bg} ${styles.text}`}>
      {r === 'admin' && <Shield size={10} />}
      {styles.label}
    </span>
  );
}


/**
 * Admin-controlled Razorpay enable / disable. When off, the user-side
 * Add-credits modal hides the Razorpay tab and routes everyone to
 * the manual QR + reference flow. Useful when Razorpay is mid-KYC,
 * the gateway is misbehaving, or we just want to test the manual
 * flow on production.
 *
 * Optimistic update — flips locally on click, reverts on error.
 */
function RazorpayToggle() {
  const [enabled, setEnabled] = useState(null); // null = loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/admin/razorpay-enabled')
      .then((r) => { if (!cancelled) setEnabled(r.data?.enabled !== false); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load Razorpay state'); });
    return () => { cancelled = true; };
  }, []);

  const toggle = async () => {
    if (enabled === null || busy) return;
    const next = !enabled;
    setBusy(true);
    setError(null);
    setEnabled(next); // optimistic
    try {
      const { data } = await api.patch('/admin/razorpay-enabled', { enabled: next });
      setEnabled(!!data?.enabled);
    } catch (e) {
      setEnabled(!next); // revert
      setError(e.message || 'Failed to update Razorpay state');
    } finally {
      setBusy(false);
    }
  };

  if (enabled === null) {
    return (
      <div className="mb-5 rounded-2xl bg-white border border-neutral-200 p-4 text-sm text-neutral-500">
        Loading Razorpay status…
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-2xl bg-white border border-neutral-200 p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          Razorpay payments
        </p>
        <p className="text-sm font-semibold mt-0.5">
          {enabled
            ? 'Enabled — users see the Razorpay tab on Add credits.'
            : 'Disabled — only the manual QR + reference flow is shown.'}
        </p>
        {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        disabled={busy}
        className={`relative w-12 h-6 rounded-full transition shrink-0 disabled:opacity-60 ${
          enabled ? 'bg-tinder' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
            enabled ? 'translate-x-6' : ''
          }`}
        />
      </button>
    </div>
  );
}
