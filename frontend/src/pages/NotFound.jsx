import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] relative overflow-hidden bg-[#fff5f9] text-ink grid place-items-center">
      <div aria-hidden className="pointer-events-none absolute -top-48 -right-32 w-[520px] h-[520px] rounded-full bg-pink-300/45 blur-[110px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 w-[480px] h-[480px] rounded-full bg-fuchsia-300/30 blur-[110px]" />

      <div className="relative text-center px-6">
        <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-white grid place-items-center text-brand-500 shadow-lg shadow-pink-200/50">
          <Heart size={32} fill="currentColor" />
        </div>
        <p className="text-5xl font-bold tracking-tight mb-2">404</p>
        <p className="text-sm text-neutral-600 mb-6">Couldn't find that page.</p>
        <Link
          to="/"
          className="inline-flex px-5 py-2.5 rounded-full bg-tinder text-white text-sm font-semibold shadow-tinder hover:brightness-110 transition"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
