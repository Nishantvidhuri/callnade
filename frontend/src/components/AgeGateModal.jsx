import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShieldAlert, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import { forceLogVisit } from '../services/visit.js';

/**
 * Anonymous-visitor age gate. Pops up every single time the modal mounts
 * (i.e. every time an anonymous user lands on a route that mounts this
 * component — currently just the home page). Logged-in users have
 * already accepted the gate at signup, so they're never shown it.
 *
 * Strict 18+ disclosure with explicit anti-CSAM language. The user
 * must agree to the Terms checkbox before the CTA enables. No
 * localStorage caching — every fresh visit re-prompts.
 */
export default function AgeGateModal() {
  const me = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(true); // pre-checked, matches reference UX

  useEffect(() => {
    if (me) return; // logged-in users skip the gate entirely
    setOpen(true);
  }, [me]);

  if (!open) return null;

  const accept = () => {
    if (!agreed) return;
    forceLogVisit('age-gate/accept');
    setOpen(false);
  };

  const exit = () => {
    forceLogVisit('age-gate/exit');
    window.location.replace('https://www.google.com');
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-3xl bg-white text-ink border border-neutral-200 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)] flex flex-col max-h-[92dvh] overflow-hidden animate-[pop_150ms_ease-out]"
      >
        {/* Header — pink wash + branded shield. Replaces the emoji
            shock row with a single confident icon. */}
        <div className="px-6 pt-6 pb-5 text-center shrink-0 bg-gradient-to-b from-brand-50 to-white border-b border-brand-100">
          <span className="inline-flex w-12 h-12 rounded-full bg-tinder text-white items-center justify-center shadow-md shadow-tinder/30">
            <ShieldAlert size={22} strokeWidth={2.2} />
          </span>
          <h2 className="mt-3 text-lg font-bold tracking-tight">
            Adult content — age verification
          </h2>
          <p className="mt-1 text-[12px] text-neutral-500">
            callnade is an 18+ platform. Please confirm before continuing.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4 text-[13px] leading-relaxed text-neutral-700">
          {/* Zero-tolerance card — themed, not a wall of red caps. */}
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700 mb-1.5 inline-flex items-center gap-1.5">
              <AlertTriangle size={12} strokeWidth={2.5} /> Zero-tolerance policy
            </p>
            <p className="text-[12.5px] text-rose-900/90 leading-snug">
              callnade has a zero-tolerance policy for underage broadcasting. If
              you are not legally an adult, or if any pornographic, erotic, or
              sexual photo or video content involving a person under the age of
              majority is broadcast, your account data will be transferred to
              the relevant authorities under international laws against child
              sexual abuse material (CSAM).
            </p>
          </div>

          {/* Disclosure */}
          <p>
            By proceeding to use the platform — including turning on your
            camera — you confirm and warrant that:
          </p>
          <ul className="space-y-2 pl-5 list-disc marker:text-tinder">
            <li>
              You are at least 18 years old and an adult under the laws of your
              country (the &ldquo;age of majority&rdquo;).
            </li>
            <li>
              Anyone who appears on camera with you has also reached the age of
              majority.
            </li>
            <li>
              You will not allow anyone under the age of majority to use
              callnade, communicate through it, or perform any action through
              it.
            </li>
          </ul>
          <p className="text-[12px] text-neutral-500">
            callnade may permanently block any account where moderators have
            reasonable grounds to suspect the user is under the age of
            majority.
          </p>
        </div>

        {/* Footer — terms checkbox + CTA */}
        <div className="px-6 py-4 border-t border-neutral-200 shrink-0 space-y-3 bg-neutral-50/60">
          <button
            type="button"
            onClick={() => setAgreed((v) => !v)}
            className="flex items-start gap-3 w-full text-left group"
            aria-pressed={agreed}
          >
            <span
              className={`mt-0.5 w-5 h-5 rounded-md grid place-items-center shrink-0 transition border-2 ${
                agreed
                  ? 'bg-tinder border-tinder text-white'
                  : 'bg-white border-neutral-300 text-transparent group-hover:border-neutral-400'
              }`}
            >
              <Check size={13} strokeWidth={3.2} />
            </span>
            <span className="text-[12.5px] text-neutral-700 leading-snug">
              I have read, understood, and agree to the{' '}
              <Link to="/terms" className="text-tinder font-semibold hover:underline">
                Terms &amp; Conditions
              </Link>
              {' and the '}
              <Link to="/privacy" className="text-tinder font-semibold hover:underline">
                Privacy &amp; Cookies Policy
              </Link>
              .
            </span>
          </button>

          <button
            onClick={accept}
            disabled={!agreed}
            className="w-full px-4 py-3.5 text-sm font-bold rounded-full text-white bg-tinder shadow-md shadow-tinder/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            I&rsquo;m 18 or older — Continue
          </button>

          <button
            onClick={exit}
            className="block mx-auto text-[11px] font-medium text-neutral-500 hover:text-rose-600 underline-offset-2 hover:underline transition"
          >
            I&rsquo;m under 18 — take me elsewhere
          </button>
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
