import { useEffect, useState } from 'react';
import { Video, X, Wallet, Phone, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';

export default function PackagePickerModal({ peer, open, onClose, onStart, callTypeFilter }) {
  const me = useAuthStore((s) => s.user);
  const balance = me?.walletBalance ?? 0;

  const [allPackages, setAllPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !peer?.username) return;
    setLoading(true);
    setError(null);
    api
      .get(`/users/${peer.username}`)
      .then((r) => setAllPackages(r.data?.packages || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, peer?.username]);

  if (!open) return null;

  // Optionally filter by call type. Falls back to "video" for legacy
  // packages that don't have callType set yet.
  const packages = callTypeFilter
    ? allPackages.filter((p) => (p.callType || 'video') === callTypeFilter)
    : allPackages;

  // Match the backend rule (call.handlers.js): the caller only needs
  // enough credits to cover the FIRST minute. The recharge banner
  // fires only when even one minute of the cheapest package is
  // unaffordable. `perMinFor()` falls back to full price for legacy
  // packages with no duration.
  const perMinFor = (p) =>
    p.durationMinutes && p.durationMinutes > 0 ? p.price / p.durationMinutes : p.price;
  const paidPackages = packages.filter((p) => (p.price ?? 0) > 0);
  const cheapest = paidPackages.length
    ? paidPackages.reduce((min, p) => (perMinFor(p) < perMinFor(min) ? p : min))
    : null;
  const cheapestPerMin = cheapest ? perMinFor(cheapest) : 0;
  const cantAffordAny = !!cheapest && balance < cheapestPerMin;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl text-left relative animate-[pop_150ms_ease-out] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div className="min-w-0 flex items-center gap-3">
            {callTypeFilter && (
              <span
                className={`w-9 h-9 rounded-full grid place-items-center shrink-0 text-white ${
                  callTypeFilter === 'audio' ? 'bg-sky-500' : 'bg-tinder'
                }`}
              >
                {callTypeFilter === 'audio' ? <Phone size={16} /> : <Video size={16} />}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm text-neutral-500">
                {callTypeFilter === 'audio'
                  ? 'Pick an audio call package'
                  : callTypeFilter === 'video'
                    ? 'Pick a video call package'
                    : 'Start a call with'}
              </p>
              <p className="font-bold text-base truncate">@{peer?.username}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Low-balance prompt — appears when the viewer can't afford
              the cheapest matching package. We still render the
              package list below so they know what's available, but
              the headline action becomes "recharge". */}
          {!loading && !error && cantAffordAny && (
            <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 rounded-full bg-amber-500 text-white grid place-items-center shrink-0 mt-0.5">
                  <AlertCircle size={16} strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-900">
                    Recharge to connect — your balance is low.
                  </p>
                  <p className="text-[12.5px] text-amber-800/90 mt-0.5 leading-snug">
                    Even the cheapest creator costs{' '}
                    <span className="font-bold">₹{fmtCredits(cheapestPerMin)}/min</span>
                    {' '}and you only have{' '}
                    <span className="font-bold">₹{fmtCredits(balance)}</span>
                    {' '}in your wallet — top up to connect.
                  </p>
                </div>
              </div>
              <Link
                to="/billing"
                onClick={onClose}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-full text-white bg-tinder shadow-md shadow-tinder/30 hover:brightness-110 transition"
              >
                <Wallet size={14} strokeWidth={2.4} /> Recharge wallet
              </Link>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-neutral-400 text-center py-8">Loading packages…</p>
          ) : error ? (
            <p className="text-sm text-rose-600 text-center py-6">{error}</p>
          ) : packages.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-neutral-500 mb-4">
                {callTypeFilter
                  ? `This user hasn't published any ${callTypeFilter} call packages yet.`
                  : "This user hasn't published any packages yet."}
              </p>
              <button
                onClick={() => {
                  onStart(null, callTypeFilter || 'video');
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder/30 hover:brightness-110 transition"
              >
                {callTypeFilter === 'audio' ? <Phone size={14} /> : <Video size={14} />}
                Start free {callTypeFilter || 'video'} call
              </button>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {packages.map((p) => {
                const perMin = p.durationMinutes ? p.price / p.durationMinutes : null;
                // Affordability rule mirrors the backend: only the
                // first minute needs to be in the wallet at start;
                // the call ends when the wallet hits zero. Legacy
                // packages without a duration fall back to flat-fee.
                const minCharge = perMin ?? p.price;
                const insufficient = balance < minCharge;
                const isAudio = p.callType === 'audio';
                return (
                  <li
                    key={p.id}
                    className="rounded-2xl border border-neutral-200 p-4 hover:border-brand-300 hover:bg-brand-50/40 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{p.title}</p>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${
                              isAudio ? 'bg-sky-100 text-sky-700' : 'bg-brand-100 text-brand-600'
                            }`}
                          >
                            {isAudio ? <Phone size={9} /> : <Video size={9} />}
                            {isAudio ? 'Audio' : 'Video'}
                          </span>
                        </div>
                        {p.description && (
                          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{p.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-base text-emerald-600 tabular-nums">{p.price}</p>
                        {p.durationMinutes != null && (
                          <p className="text-[11px] text-neutral-500">{p.durationMinutes} min</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-[11px] text-neutral-500">
                        {perMin != null ? `≈ ${perMin.toFixed(1)} credits/min` : 'flat fee'}
                      </p>
                      {insufficient ? (
                        <span
                          title={`Minimum to start: ${fmtCredits(minCharge)} credits (one minute)`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600"
                        >
                          <Wallet size={11} />
                          Need {fmtCredits(minCharge)}
                          {perMin != null && <span className="text-[10px]">/min</span>}
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            onStart(p.id, p.callType || 'video');
                            onClose();
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full text-white bg-tinder hover:brightness-110 transition"
                        >
                          {isAudio ? <Phone size={12} /> : <Video size={12} />} Start
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-neutral-500 shrink-0">Your balance</span>
            <span className="font-bold tabular-nums text-emerald-700 inline-flex items-center gap-1">
              <Wallet size={11} />
              {fmtCredits(balance)}
            </span>
          </div>
          {/* Quick recharge — always visible so a viewer can top up
              without bouncing back to billing manually, regardless of
              whether they can afford the current packages or not. */}
          <Link
            to="/billing"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full text-white bg-tinder shadow-md shadow-tinder/30 hover:brightness-110 transition shrink-0"
          >
            <Wallet size={12} strokeWidth={2.4} /> Recharge
          </Link>
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
