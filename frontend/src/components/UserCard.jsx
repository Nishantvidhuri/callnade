import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import { useLoginPromptStore } from '../stores/loginPrompt.store.js';

export default function UserCard({ user }) {
  const me = useAuthStore((s) => s.user);
  const showPrompt = useLoginPromptStore((s) => s.show);

  const onClick = (e) => {
    if (!me) {
      e.preventDefault();
      showPrompt(`Log in or sign up to chat with @${user.username}`);
    }
  };

  return (
    <Link
      to={`/u/${user.username}`}
      onClick={onClick}
      className="group relative block aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-200 shadow-sm hover:shadow-lg transition"
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-5xl font-medium text-white bg-tinder">
          {(user.displayName || user.username || '?').charAt(0).toUpperCase()}
        </div>
      )}

      {/* Bottom fade for legibility */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

      {/* Top-left subscribers chip */}
      <span
        title={`${user.followerCount || 0} subscribers`}
        className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white bg-black/40 backdrop-blur-sm"
      >
        <Heart size={11} strokeWidth={2} fill="currentColor" />
        {format(user.followerCount)}
      </span>

      {/* Top-right LIVE / online badge */}
      {user.online && (
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide text-white bg-rose-600 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
      )}

      {/* Bottom: name + status */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
        <p className="text-sm font-semibold truncate drop-shadow">
          {user.displayName || user.username}
        </p>
        {user.online ? (
          <p className="inline-flex items-center gap-1.5 text-[11px] mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-emerald-300 font-medium">Online</span>
          </p>
        ) : (
          <p className="text-[11px] opacity-80 truncate">@{user.username}</p>
        )}
      </div>
    </Link>
  );
}

function format(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
