import { ShieldAlert } from 'lucide-react';

/**
 * Hard age-gate modal shown EVERY TIME a user enters the 18+ tab. Unlike
 * the visitor age-gate (which respects a 24h localStorage cookie), this
 * one is per-session — they have to confirm each visit.
 *
 * Renders a blurred backdrop over the page content so the 18+ creators
 * aren't peekable behind it.
 */
export default function AdultGateModal({ open, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4"
      style={{
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl text-center p-6 sm:p-7 animate-[pop_150ms_ease-out]">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-100 grid place-items-center text-rose-600">
          <ShieldAlert size={28} strokeWidth={1.8} />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold mb-1">18+ content ahead</h2>
        <p className="text-sm text-neutral-600 mb-5 leading-relaxed">
          The next page contains adult-oriented creators. By continuing you
          confirm that you are at least 18 years old and consent to see
          mature content.
        </p>

        <div className="grid grid-cols-1 gap-2.5">
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-3 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder hover:brightness-110 transition"
          >
            Yes, I'm 18 or older — continue
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 text-sm font-medium rounded-full border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition"
          >
            Take me back
          </button>
        </div>

        <p className="text-[11px] text-neutral-400 mt-4">
          You'll see this prompt every time you visit the 18+ section.
        </p>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
