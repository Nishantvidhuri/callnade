import { Link } from 'react-router-dom';
import { X, Heart } from 'lucide-react';
import { useLoginPromptStore } from '../stores/loginPrompt.store.js';

export default function LoginPromptModal() {
  const open = useLoginPromptStore((s) => s.open);
  const message = useLoginPromptStore((s) => s.message);
  const hide = useLoginPromptStore((s) => s.hide);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center relative animate-[pop_150ms_ease-out]">
        <button
          onClick={hide}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-ink"
        >
          <X size={18} />
        </button>

        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-tinder grid place-items-center text-white shadow-tinder">
          <Heart size={26} fill="currentColor" />
        </div>

        <h2 className="text-xl font-bold mb-1">Join callnade</h2>
        <p className="text-sm text-neutral-600 mb-6">{message}</p>

        <div className="grid grid-cols-2 gap-2.5">
          <Link
            to="/login"
            onClick={hide}
            className="px-4 py-2.5 text-sm font-semibold rounded-full border border-neutral-200 hover:bg-neutral-50 transition"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            onClick={hide}
            className="px-4 py-2.5 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder/40 hover:brightness-110 transition"
          >
            Sign up
          </Link>
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
