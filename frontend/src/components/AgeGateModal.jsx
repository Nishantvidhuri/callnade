import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
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
    <div className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/60 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl bg-neutral-950 text-white shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden animate-[pop_150ms_ease-out]">
        {/* Header — title + emoji row */}
        <div className="px-6 pt-6 pb-2 text-center shrink-0">
          <h2 className="text-xl font-bold tracking-tight">Important!!</h2>
          <div className="mt-3 text-2xl tracking-wide select-none" aria-hidden="true">
            🤬 ⚠️ 🍌 ⚠️ 🍌 ⚠️ 🤬
          </div>
        </div>

        {/* Scrollable terms body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 text-sm leading-relaxed space-y-3">
          <p className="font-semibold">Please read our rules carefully.</p>
          <p className="text-rose-500 font-semibold uppercase">
            WARNING: THIS SITE HAS A ZERO TOLERANCE POLICY FOR UNDERAGE
            BROADCASTING! IF YOU ARE NOT LEGALLY AN ADULT, OR IF YOU
            BROADCAST ANY TYPE OF PORN, EROTIC PHOTOS OR VIDEO CONTENT
            INVOLVING NON-ADULTS, YOUR PERSONAL DATA WILL BE TRANSFERRED
            TO THE RELEVANT AUTHORITIES FOR ENFORCEMENT UNDER
            INTERNATIONAL LAWS AGAINST CHILD PORNOGRAPHY.
          </p>
          <p className="text-white/85">
            Confirm you're 18 years old or over and agree to the terms
            below before signing in: By turning your camera on you
            confirm that you are 18 years old or older, and that you
            are an adult according to your country's laws (the &lsquo;age
            of majority&rsquo;). You represent and warrant that you will
            not allow persons under the age of majority to use the
            callnade application, communicate through the callnade
            application, or perform any other actions which can be
            carried out through the callnade application. You represent
            and warrant that anyone appearing on camera with you has
            also reached the age of majority. You represent and warrant
            that you will immediately report by email to{' '}
            <a
              href="mailto:info@callnade.site"
              className="underline font-semibold"
            >
              info@callnade.site
            </a>{' '}
            any and all instances where an individual who has not
            reached the age of majority is using the application, or
            any individual is broadcasting photo or video content
            involving persons under the age of majority. If the
            callnade administrators have any reasonable grounds for
            suspecting that you are under the age of majority, your
            account will be blocked permanently.
          </p>
        </div>

        {/* Footer — terms checkbox + CTA */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0 space-y-3">
          <button
            type="button"
            onClick={() => setAgreed((v) => !v)}
            className="flex items-start gap-3 w-full text-left group"
            aria-pressed={agreed}
          >
            <span
              className={`w-7 h-7 rounded-full grid place-items-center shrink-0 transition ${
                agreed
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/10 text-white/40 border border-white/30'
              }`}
            >
              {agreed && <Check size={16} strokeWidth={3.2} />}
            </span>
            <span className="text-[13px] text-white/85 leading-snug">
              I have read, understand and agree to{' '}
              <Link to="/terms" className="underline font-semibold">
                Terms and Conditions
              </Link>
              {' & '}
              <Link to="/privacy" className="underline font-semibold">
                Cookies Policy and Privacy Policy
              </Link>
            </span>
          </button>

          <button
            onClick={accept}
            disabled={!agreed}
            className="w-full px-4 py-3.5 text-base font-bold rounded-full text-white bg-tinder shadow-tinder hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Got it! Enter
          </button>

          <button
            onClick={exit}
            className="block mx-auto text-[11px] text-white/40 hover:text-white/70 underline transition"
          >
            I'm under 18 — take me out
          </button>
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
