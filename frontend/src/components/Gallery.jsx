import { Lock, Plus } from 'lucide-react';

const SLOTS = 9;

export default function Gallery({ items = [], onSlotClick, isOwner }) {
  const byPos = new Map(items.map((m) => [m.position, m]));
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {Array.from({ length: SLOTS }).map((_, i) => {
        const m = byPos.get(i);
        return (
          <Tile key={i} media={m} index={i} isOwner={isOwner} onClick={() => onSlotClick?.(i, m)} />
        );
      })}
    </div>
  );
}

function Tile({ media, index, isOwner, onClick }) {
  const empty = !media;
  const locked = media?.locked;

  if (empty && isOwner) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="aspect-square rounded-xl border border-dashed border-neutral-300 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-400 transition grid place-items-center text-neutral-400"
        aria-label={`Upload to slot ${index + 1}`}
      >
        <Plus size={20} strokeWidth={1.5} />
      </button>
    );
  }

  if (empty) {
    return <div className="aspect-square rounded-xl bg-neutral-50" />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square rounded-xl overflow-hidden bg-neutral-100 group"
    >
      {locked ? (
        <>
          {media.urls.blurred && (
            <img src={media.urls.blurred} alt="locked" className="absolute inset-0 w-full h-full object-cover [filter:blur(10px)_brightness(0.85)] scale-110" />
          )}
          <div className="absolute inset-0 grid place-items-center bg-black/15">
            <span className="w-9 h-9 rounded-full bg-white/95 grid place-items-center text-ink shadow-sm">
              <Lock size={15} strokeWidth={2} />
            </span>
          </div>
        </>
      ) : (
        media.urls.thumb && (
          <img
            src={media.urls.thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )
      )}
    </button>
  );
}
