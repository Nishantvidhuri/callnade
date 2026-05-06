export default function Tabs({ value, onChange, options }) {
  return (
    <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto pb-2 mb-5 sm:mb-7 -mx-3 sm:-mx-2 px-3 sm:px-2 scrollbar-none">
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`shrink-0 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm font-semibold transition whitespace-nowrap ${
              active
                ? 'bg-tinder text-white shadow-tinder'
                : 'bg-white/70 backdrop-blur-md text-ink border border-white/80 hover:bg-white'
            }`}
          >
            {opt.label}
            {opt.badge > 0 && (
              <span
                className={`ml-1.5 inline-grid place-items-center align-middle min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full ${
                  active ? 'bg-white/25 text-white' : 'bg-tinder text-white'
                }`}
              >
                {opt.badge > 9 ? '9+' : opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
