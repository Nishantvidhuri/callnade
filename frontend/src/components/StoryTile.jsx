import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';

export function StoryTile({ user, big = false, asAdd = false, to }) {
  const dim = big ? 'w-[260px] h-[180px]' : 'w-[200px] h-[160px]';
  return (
    <Link
      to={to || `/u/${user.username}`}
      className={`relative shrink-0 ${dim} rounded-2xl overflow-hidden bg-gradient-to-br from-rose-200 via-orange-200 to-amber-200 group`}
    >
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-rose-400/40 via-orange-400/40 to-amber-400/40" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 text-white">
        {asAdd ? (
          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 grid place-items-center shrink-0">
            <Plus size={16} strokeWidth={2.5} />
          </span>
        ) : (
          <span className="w-7 h-7 rounded-full overflow-hidden bg-white/20 ring-2 ring-white/60 shrink-0 grid place-items-center text-xs font-bold">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              (user?.username || '?').charAt(0).toUpperCase()
            )}
          </span>
        )}
        <span className="text-sm font-semibold truncate">
          {asAdd ? 'Your profile' : user?.displayName || user?.username}
        </span>
      </div>
    </Link>
  );
}
