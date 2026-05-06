import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from './Logo.jsx';

const FALLBACK = {
  warm: 'https://i.pinimg.com/736x/03/7b/21/037b21d835e95ca3b9f29884b47752b2.jpg',
  cool: 'https://i.pinimg.com/736x/7a/47/bf/7a47bf7cba0a884cc3c9ddf4b310674f.jpg',
};

const TONE = {
  warm: 'bg-[radial-gradient(120%_90%_at_50%_50%,#5a1212_0%,#3a0a0a_55%,#220505_100%)]',
  cool: 'bg-[radial-gradient(120%_90%_at_50%_50%,#3a4f7a_0%,#1d2a48_55%,#0c1226_100%)]',
};

export default function AuthLayout({
  tone = 'warm',
  title,
  subtitle,
  children,
  image,
  size = 'compact',
}) {
  const nav = useNavigate();
  const src = image || FALLBACK[tone];
  const isWide = size === 'wide';
  const innerMax = isWide ? 'max-w-[640px]' : 'max-w-[440px]';
  const cardMax = isWide ? 'md:max-w-[1280px]' : 'md:max-w-[1180px]';

  return (
    <div className={`min-h-[100dvh] w-screen md:grid md:place-items-center md:p-6 md:overflow-hidden md:${TONE[tone]} bg-[#fff5f9] md:bg-none`}>
      {/* Mobile-only soft pink atmospheric blush. Hidden on md+ where the
          radial-gradient + photo card take over. */}
      <div
        aria-hidden
        className="md:hidden pointer-events-none fixed inset-x-0 top-0 h-[55%] bg-gradient-to-b from-rose-100/80 via-rose-50/40 to-transparent"
      />

      <div className={`relative grid grid-cols-1 md:grid-cols-2 w-full ${cardMax} md:h-[min(92dvh,820px)] md:bg-white md:rounded-[28px] md:overflow-hidden md:shadow-[0_30px_80px_rgba(0,0,0,0.45)] text-ink`}>
        {/* Image panel — desktop only */}
        <aside className="relative m-0 md:m-3 md:rounded-2xl overflow-hidden bg-neutral-900 hidden md:block">
          <img
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <Link
            to="/"
            aria-label="Home"
            className="absolute top-6 left-1/2 -translate-x-1/2 inline-flex text-white drop-shadow-lg z-10"
          >
            <Logo size={48} />
          </Link>
        </aside>

        {/* Content panel — scrollable for long forms */}
        <section className="relative flex justify-center md:overflow-y-auto">
          <div
            className={`relative w-full ${innerMax} px-5 sm:px-8 flex flex-col gap-3.5`}
            style={{
              paddingTop: 'max(env(safe-area-inset-top), 16px)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
            }}
          >
            <div className="flex items-center justify-between md:block pt-1.5 md:pt-6">
              <button
                type="button"
                onClick={() => nav(-1)}
                aria-label="Go back"
                className="w-10 h-10 grid place-items-center rounded-full text-ink hover:bg-black/5 active:bg-black/10 transition -ml-1.5"
              >
                <ArrowLeft size={20} strokeWidth={1.8} />
              </button>

              {/* Mobile-only brand wordmark — replaces the desktop image
                  panel's logo and gives the page identity. */}
              <Link
                to="/"
                className="md:hidden font-logo text-2xl leading-none text-tinder tracking-wide pr-1"
              >
                callnade
              </Link>
            </div>

            <header className="mt-2 md:mt-1">
              <h1 className="m-0 mb-2 font-bold leading-[1.05] tracking-tight text-[clamp(1.75rem,7vw,2.4rem)]">
                {title}
              </h1>
              {subtitle && <p className="m-0 text-neutral-600 text-sm leading-relaxed">{subtitle}</p>}
            </header>

            <div className="mt-1">{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
