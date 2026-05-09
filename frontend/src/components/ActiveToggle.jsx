import { useState } from 'react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';

/**
 * Creator-only "Available / Unavailable" toggle. When ON the
 * creator opts in to taking calls and shows up in the home page's
 * Online section. When OFF the backend's `listOnline` filters them
 * out, so users won't initiate calls. Default is ON (server-side
 * default for `isActive`).
 *
 * Renders nothing for non-providers — call site can include this
 * unconditionally and the component will self-hide.
 */
export default function ActiveToggle({ size = 'sm', className = '' }) {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);

  if (me?.role !== 'provider') return null;

  // Treat missing/undefined as `true` so legacy creators (no field)
  // see the toggle in the on state.
  const isActive = me.isActive !== false;

  const toggle = async () => {
    if (busy) return;
    const next = !isActive;
    setBusy(true);
    // Optimistic update — flip immediately, revert on failure.
    setUser({ ...me, isActive: next });
    try {
      const { data } = await api.patch('/users/me', { isActive: next });
      // Server is source of truth for the final value.
      setUser({ ...useAuthStore.getState().user, ...data });
    } catch {
      setUser({ ...useAuthStore.getState().user, isActive });
    } finally {
      setBusy(false);
    }
  };

  // Compact on mobile (sm) — slightly larger on desktop (md).
  const heightCls = size === 'md' ? 'h-10 sm:h-11' : 'h-10';
  const padCls = size === 'md' ? 'pl-3 pr-1' : 'pl-2.5 pr-0.5';
  const containerCls = isActive
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : 'bg-neutral-100 border-neutral-200 text-neutral-500';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      role="switch"
      aria-checked={isActive}
      title={isActive ? 'You are active — tap to set inactive' : 'You are inactive — tap to set active'}
      className={`inline-flex items-center gap-2 rounded-full border text-xs font-bold tracking-wide shadow-sm transition shrink-0 disabled:opacity-50 ${heightCls} ${padCls} ${containerCls} ${className}`}
    >
      <span className="hidden sm:inline">{isActive ? 'Active' : 'Inactive'}</span>

      {/* iOS-style switch knob — slides between left (off) and right
          (on). The visible position is tied to `isActive` so the
          state change is obvious at a glance. */}
      <span
        className={`relative inline-block w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
          isActive ? 'bg-emerald-500' : 'bg-neutral-300'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            isActive ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}
