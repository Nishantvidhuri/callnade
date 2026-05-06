export function AuthField({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm relative">
      <span className="font-semibold text-ink">{label}</span>
      {children}
      {hint && <small className="text-neutral-500 text-xs">{hint}</small>}
    </label>
  );
}

export const inputCls =
  'w-full px-5 py-3 text-[0.95rem] rounded-full border border-neutral-300 bg-white text-ink placeholder:text-neutral-400 focus:outline-none focus:border-ink focus:ring-4 focus:ring-black/5 transition';

export function IconInput({ icon: Icon, className = '', ...props }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon
          size={18}
          strokeWidth={1.8}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
        />
      )}
      <input
        {...props}
        className={`w-full ${Icon ? 'pl-11' : 'pl-5'} pr-5 py-3 text-[0.95rem] rounded-full border border-neutral-300 bg-white text-ink placeholder:text-neutral-400 focus:outline-none focus:border-ink focus:ring-4 focus:ring-black/5 transition ${className}`}
      />
    </div>
  );
}
