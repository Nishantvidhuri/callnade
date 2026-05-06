import { Link } from 'react-router-dom';
import { Wallet, X, ArrowRight } from 'lucide-react';

export default function RechargeModal({ open, balance = 0, required = 0, onClose }) {
  if (!open) return null;
  const short = Math.max(0, required - balance);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center relative animate-[pop_150ms_ease-out]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-ink"
        >
          <X size={18} />
        </button>

        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 grid place-items-center text-amber-600">
          <Wallet size={26} strokeWidth={2} />
        </div>

        <h2 className="text-xl font-bold mb-1">Not enough credits</h2>
        <p className="text-sm text-neutral-600 mb-5">
          This package costs <strong>{required} credits</strong>. Top up your wallet to start the call.
        </p>

        <div className="flex items-center justify-around mb-5 text-sm">
          <div>
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Your balance</p>
            <p className="text-xl font-bold tabular-nums">{balance}</p>
          </div>
          <ArrowRight size={18} className="text-neutral-300" />
          <div>
            <p className="text-[11px] text-neutral-500 uppercase tracking-wide">Required</p>
            <p className="text-xl font-bold tabular-nums text-emerald-600">{required}</p>
          </div>
        </div>

        <p className="text-xs text-rose-600 mb-5">You're short by {short} credits.</p>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium rounded-full border border-neutral-200 hover:bg-neutral-50 transition"
          >
            Cancel
          </button>
          <Link
            to="/settings"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder/40 hover:brightness-110 transition inline-flex items-center justify-center gap-1"
          >
            Recharge
          </Link>
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
