import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

export default function PasswordInput({ className = '', ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Lock
        size={18}
        strokeWidth={1.8}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
      />
      <input
        {...props}
        type={shown ? 'text' : 'password'}
        className={`w-full pl-11 pr-12 py-3 text-[0.95rem] rounded-full border border-neutral-300 bg-white text-ink placeholder:text-neutral-400 focus:outline-none focus:border-ink focus:ring-4 focus:ring-black/5 transition ${className}`}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-neutral-500 hover:text-ink grid place-items-center"
      >
        {shown ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
      </button>
    </div>
  );
}
