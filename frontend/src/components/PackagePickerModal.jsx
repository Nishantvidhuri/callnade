import { useEffect, useState } from 'react';
import { Video, X, Wallet, Phone } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { fmtCredits } from '../utils/formatCredits.js';

export default function PackagePickerModal({ peer, open, onClose, onStart }) {
  const me = useAuthStore((s) => s.user);
  const balance = me?.walletBalance ?? 0;

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !peer?.username) return;
    setLoading(true);
    setError(null);
    api
      .get(`/users/${peer.username}`)
      .then((r) => setPackages(r.data?.packages || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, peer?.username]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl text-left relative animate-[pop_150ms_ease-out] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div className="min-w-0">
            <p className="text-sm text-neutral-500">Start a call with</p>
            <p className="font-bold text-base truncate">@{peer?.username}</p>
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
          {loading ? (
            <p className="text-sm text-neutral-400 text-center py-8">Loading packages…</p>
          ) : error ? (
            <p className="text-sm text-rose-600 text-center py-6">{error}</p>
          ) : packages.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-neutral-500 mb-4">
                This user hasn't published any packages yet.
              </p>
              <button
                onClick={() => {
                  onStart(null);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder/30 hover:brightness-110 transition"
              >
                <Video size={14} /> Start free call
              </button>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {packages.map((p) => {
                const perMin = p.durationMinutes ? p.price / p.durationMinutes : null;
                const insufficient = balance < p.price;
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
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                          <Wallet size={11} /> Need {p.price}
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

        <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between text-xs">
          <span className="text-neutral-500">Your balance</span>
          <span className="font-bold tabular-nums text-emerald-700">
            <Wallet size={11} className="inline mr-1 -mt-0.5" />
            {fmtCredits(balance)} credits
          </span>
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
