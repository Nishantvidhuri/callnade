import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth.store.js';
import { forceLogVisit } from '../services/visit.js';

/**
 * Anonymous-visitor age gate. Pops up every single time the modal mounts
 * (i.e. every time an anonymous user lands on a route that mounts this
 * component — currently just the home page). Logged-in users have
 * already accepted the gate at signup, so they're never shown it.
 *
 * No localStorage caching — the product wants the prompt every time so
 * anyone bouncing through the home page leaves a visible trail.
 */
export default function AgeGateModal() {
  const me = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (me) return; // logged-in users skip the gate entirely
    setOpen(true);
  }, [me]);

  if (!open) return null;

  const accept = () => {
    forceLogVisit('age-gate/accept');
    setOpen(false);
  };

  const exit = () => {
    forceLogVisit('age-gate/exit');
    window.location.replace('https://www.google.com');
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/60 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl text-center p-7 animate-[pop_150ms_ease-out]">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-tinder grid place-items-center text-white shadow-tinder text-2xl font-extrabold">
          18+
        </div>

        <h2 className="text-xl font-bold mb-1">Are you 18 or older?</h2>
        <p className="text-sm text-neutral-600 mb-6">
          callnade contains adult-oriented content. By continuing you confirm you are at least 18
          years old and agree to our Terms.
        </p>

        <div className="grid grid-cols-1 gap-2.5">
          <button
            onClick={accept}
            className="px-4 py-3 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder hover:brightness-110 transition"
          >
            Yes, I'm 18 or older
          </button>
          <button
            onClick={exit}
            className="px-4 py-3 text-sm font-medium rounded-full border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition"
          >
            No, take me out
          </button>
        </div>

        <p className="text-[11px] text-neutral-400 mt-5">
          You'll be asked to confirm again next time you visit.
        </p>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
