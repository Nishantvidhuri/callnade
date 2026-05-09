import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';

/**
 * Visitor-only CTA. Shown to anonymous users on the home page; clicking
 * jumps them to the creator-signup flow. Once a user is authenticated
 * (any role), this disappears entirely — they can upgrade from Settings.
 *
 * Mobile: centered above the bottom safe-area, prominent gradient pill.
 * Desktop: pinned to the bottom-left corner of the viewport so it doesn't
 * collide with the home grid's right-side controls.
 */
export default function BecomeCreatorButton() {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();

  if (me) return null;

  return (
    <button
      onClick={() => nav('/signup')}
      className="
        fixed z-30 group
        left-1/2 -translate-x-1/2 lg:left-6 lg:translate-x-0
        bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))]
        inline-flex items-center gap-2.5
        px-5 py-3
        rounded-full
        bg-tinder text-white
        text-sm font-bold tracking-tight
        shadow-xl shadow-pink-500/50
        ring-1 ring-white/30
        hover:brightness-110 active:scale-[0.97]
        transition
      "
    >
      <span className="w-7 h-7 rounded-full bg-white/25 backdrop-blur-sm grid place-items-center group-hover:rotate-12 transition shrink-0">
        <Sparkles size={14} fill="currentColor" />
      </span>
      <span className="whitespace-nowrap drop-shadow-sm">Become a Creator</span>
    </button>
  );
}
