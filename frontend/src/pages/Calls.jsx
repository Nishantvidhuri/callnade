import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, PhoneOff, Video, Wallet, Clock } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import { useIncomingCallsStore } from '../stores/incomingCalls.store.js';
import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';
import { enterFullscreenOnMobile } from '../utils/fullscreen.js';

export default function Calls() {
  const me = useAuthStore((s) => s.user);
  const items = useIncomingCallsStore((s) => s.items);
  const remove = useIncomingCallsStore((s) => s.remove);
  const nav = useNavigate();
  const [acceptError, setAcceptError] = useState(null);

  const accept = (call) => {
    enterFullscreenOnMobile();
    setAcceptError(null);
    const socket = getSocket();
    socket.emit('call:accept', { callId: call.callId }, (ack) => {
      if (ack?.error) {
        // Most common: 'invalid' — happens when the backend restarted
        // between call:invite and call:accept (in-memory call map wiped),
        // or the caller already hung up.
        setAcceptError(
          ack.error === 'invalid'
            ? 'This call is no longer active. Ask them to call again.'
            : ack.error,
        );
        // Still drop it from the list so the stale card disappears.
        remove(call.callId);
        return;
      }
      remove(call.callId);
      // Forward earnRate + caller's current balance so the creator sees how
      // many credits the caller has left during the call.
      nav(`/call/incoming/${call.callId}`, {
        state: {
          earnRate: call.earnRate || 0,
          billRate: call.perMinuteRate || 0,
          callerBalance: call.callerBalance || 0,
          callType: call.callType === 'audio' ? 'audio' : 'video',
          callerLabel: call.from?.username || null,
        },
      });
    });
  };

  const decline = (call) => {
    const socket = getSocket();
    socket.emit('call:reject', { callId: call.callId });
    remove(call.callId);
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav(-1)}
              className="lg:hidden w-9 h-9 grid place-items-center rounded-full bg-white/80 backdrop-blur-md border border-white/80 text-neutral-700 hover:bg-white"
              aria-label="Back"
            >
              <ArrowLeft size={18} strokeWidth={1.8} />
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Incoming calls</h1>
              <p className="text-sm text-neutral-500 mt-0.5">
                {items.length === 0
                  ? 'No one is calling right now'
                  : `${items.length} ringing now`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-24 lg:pb-8">
          {acceptError && (
            <div className="mb-3 px-4 py-2.5 bg-rose-50 border border-rose-100 text-rose-700 text-sm rounded-xl flex items-center justify-between gap-3">
              <span className="min-w-0">{acceptError}</span>
              <button
                onClick={() => setAcceptError(null)}
                className="text-xs font-semibold underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {items.map((c) => {
                const minutes =
                  typeof c.callerBalance === 'number' && c.perMinuteRate > 0
                    ? c.callerBalance / c.perMinuteRate
                    : null;
                return (
                  <li
                    key={c.callId}
                    className="relative overflow-hidden rounded-2xl bg-white shadow-sm border border-neutral-200 hover:shadow-md transition"
                  >
                    {/* Soft pink accent stripe + tinted top so the card reads
                        as "incoming" without being noisy. */}
                    <span className="absolute inset-y-0 left-0 w-1 bg-tinder" aria-hidden />
                    <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-rose-50 to-transparent pointer-events-none" />

                    <div className="relative p-4 flex items-center gap-3">
                      <div className="relative shrink-0">
                        <div className="w-14 h-14 rounded-full bg-tinder grid place-items-center text-white text-lg font-bold shadow-tinder/30 shadow-md">
                          {(c.from?.username || '?').charAt(0).toUpperCase()}
                        </div>
                        {/* Pulsing ring instead of corner dot — feels more "live". */}
                        <span className="absolute -inset-1 rounded-full ring-2 ring-rose-400 animate-ping opacity-60 pointer-events-none" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <p className="font-semibold text-[15px] truncate">
                            @{c.from?.username || 'Unknown'}
                          </p>
                          <span className="text-[10px] font-bold tracking-wide uppercase text-rose-600 animate-pulse shrink-0">
                            {c.callType === 'audio' ? 'Audio · Calling' : 'Calling'}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">{relTime(c.at)}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => decline(c)}
                          aria-label="Decline"
                          className="w-11 h-11 rounded-full grid place-items-center bg-white border border-neutral-200 text-neutral-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 active:scale-95 transition"
                        >
                          <PhoneOff size={17} />
                        </button>
                        <button
                          onClick={() => accept(c)}
                          aria-label="Accept"
                          className="w-12 h-12 rounded-full grid place-items-center bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/40 active:scale-95 transition"
                        >
                          <Phone size={18} strokeWidth={2.4} />
                        </button>
                      </div>
                    </div>

                    {/* Meta row — own row so it never wraps awkwardly under
                        the name/buttons block. Hidden when there's nothing
                        to show. */}
                    {(typeof c.callerBalance === 'number' || minutes != null) && (
                      <div className="relative flex items-center gap-3 px-4 py-2 border-t border-neutral-100 bg-neutral-50/60 text-[11px]">
                        {typeof c.callerBalance === 'number' && (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 tabular-nums">
                            <Wallet size={12} strokeWidth={2.2} />
                            {c.callerBalance} credits
                          </span>
                        )}
                        {minutes != null && (
                          <>
                            <span className="w-px h-3 bg-neutral-300" />
                            <span className="inline-flex items-center gap-1 text-neutral-600 tabular-nums">
                              <Clock size={12} strokeWidth={2.2} />
                              ~{minutes.toFixed(1)} min
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <HomeBottomBar />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-100 grid place-items-center text-brand-500">
        <Video size={26} strokeWidth={1.8} />
      </div>
      <p className="font-semibold">No incoming calls</p>
      <p className="text-sm text-neutral-500 mt-1">
        When someone rings you, the call shows up here in real time.
      </p>
    </div>
  );
}

function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
