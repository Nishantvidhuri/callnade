import { Link } from 'react-router-dom';
import { Sparkles, Lock, Video } from 'lucide-react';

export default function HomeRightRail({ trending = [] }) {
  return (
    <aside className="hidden xl:flex flex-col gap-5 w-[300px] shrink-0">
      <div className="rounded-3xl bg-white border border-black/5 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-rose-500" />
          <p className="bg-gradient-to-r from-orange-500 via-rose-500 to-red-600 bg-clip-text text-transparent font-semibold text-sm">
            Top Creators
          </p>
        </div>
        {trending.length === 0 && <p className="text-sm text-neutral-400">Loading…</p>}
        <ul className="space-y-3">
          {trending.slice(0, 5).map((u, i) => (
            <li key={u.id}>
              <Link to={`/u/${u.username}`} className="flex items-center gap-3 group">
                <span className="text-neutral-400 font-bold w-4 text-sm">#{i + 1}</span>
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-300 to-orange-300 grid place-items-center text-white text-xs font-bold">
                    {(u.displayName || u.username).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate group-hover:text-rose-600 transition">
                    {u.displayName || u.username}
                  </p>
                  <p className="text-xs text-neutral-400">{format(u.followerCount)} followers</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-3xl p-5 text-white bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 shadow-lg shadow-rose-500/20">
        <p className="font-semibold text-base mb-2">How callnade works</p>
        <ul className="space-y-2 text-sm/relaxed">
          <Tip icon={Lock}>3 photos public, 6 locked behind a follow request</Tip>
          <Tip icon={Sparkles}>Accept a request → unlock the full gallery</Tip>
          <Tip icon={Video}>Mutual follow → 1:1 video calls open up</Tip>
        </ul>
      </div>
    </aside>
  );
}

function Tip({ icon: Icon, children }) {
  return (
    <li className="flex items-start gap-2">
      <Icon size={14} className="mt-0.5 shrink-0 opacity-90" />
      <span>{children}</span>
    </li>
  );
}

function format(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
