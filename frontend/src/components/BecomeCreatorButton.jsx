import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';

/**
 * Visitor-only CTA. Shown to anonymous users on the home page; clicking
 * jumps them to the creator-signup flow. Once a user is authenticated
 * (any role), this disappears entirely — they can upgrade from Settings.
 */
export default function BecomeCreatorButton() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();

  if (me) return null;

  return (
    <button
      onClick={() => nav('/signup?as=creator')}
      className="fixed bottom-6 left-6 z-30 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-neutral-200 shadow-xl shadow-pink-200/50 text-sm font-semibold hover:bg-neutral-50 transition group"
    >
      <span className="w-7 h-7 rounded-full bg-tinder grid place-items-center text-white shadow-tinder/40 group-hover:rotate-12 transition">
        <Sparkles size={14} fill="currentColor" />
      </span>
      Become a Creator
    </button>
  );
}
