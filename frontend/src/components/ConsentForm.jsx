import { useMemo, useState } from 'react';
import { Check, ArrowLeft, ShieldCheck, Lock, FileText } from 'lucide-react';

const REQUIRED_DECLARATIONS = [
  'I confirm that I am at least 18 years old.',
  'I understand that I am solely responsible for my interactions and conduct on the platform.',
  'I agree to comply with all platform rules and applicable laws.',
  'I consent to the platform’s privacy, moderation, and safety policies.',
];

/**
 * Two-step signup gating UI: this is the second step. Renders the full
 * Terms / Community Guidelines document, requires the user to tick five
 * declarations and provide their full legal name before submitting.
 *
 * Props:
 *   defaultName  — pre-fill from the firstName/lastName fields on step 1
 *   onBack       — return to the form
 *   onAccept     — fires when all checks pass; receives { fullName, signature, acceptedAt }
 *   submitting   — disables the CTA while the parent's signup network call is in flight
 *   error        — error string to surface above the CTA
 *   isCreator    — adjusts the headline copy slightly for creator accounts
 */
export default function ConsentForm({
  defaultName = '',
  onBack,
  onAccept,
  submitting = false,
  error = null,
  isCreator = false,
}) {
  const [checks, setChecks] = useState(() => REQUIRED_DECLARATIONS.map(() => false));
  const [fullName, setFullName] = useState(defaultName);
  const [signature, setSignature] = useState('');
  const [touched, setTouched] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }, []);

  const allChecked = checks.every(Boolean);
  const nameOk = fullName.trim().length >= 2;
  const signatureOk = signature.trim().length >= 2;
  const canSubmit = allChecked && nameOk && signatureOk && !submitting;

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    onAccept?.({
      fullName: fullName.trim(),
      signature: signature.trim(),
      acceptedAt: new Date().toISOString(),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {/* Back to step 1 */}
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-ink -ml-1.5 px-1.5 py-1 rounded-lg hover:bg-black/5 transition"
      >
        <ArrowLeft size={15} /> Back to details
      </button>

      <header>
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-tinder mb-1.5">
          <ShieldCheck size={12} /> Step 2 of 2
        </p>
        <h2 className="text-2xl font-bold tracking-tight">
          {isCreator ? 'Creator agreement' : 'Consent & community guidelines'}
        </h2>
        <p className="text-sm text-neutral-600 mt-1">
          Please read carefully and confirm before {isCreator ? 'finishing your creator account' : 'creating your account'}.
        </p>
      </header>

      {/* Scrollable document */}
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 bg-white flex items-center gap-2">
          <FileText size={14} className="text-neutral-500" />
          <p className="text-sm font-semibold">User consent &amp; community guidelines</p>
          <span className="ml-auto text-[11px] text-neutral-400 tabular-nums">{today}</span>
        </div>

        <div className="max-h-[44vh] sm:max-h-[55vh] overflow-y-auto px-4 py-3.5 text-[13px] leading-relaxed text-neutral-700 space-y-4">
          <p>
            By creating an account, uploading content, interacting with users, or using any feature of
            this platform — including messaging, profile sharing, image viewing, and video calling —
            you agree to the following terms.
          </p>

          <Section n={1} title="Eligibility Requirements">
            <p>By using this platform you confirm that:</p>
            <List
              items={[
                'You are at least 18 years old.',
                'You are legally permitted to use online social and communication platforms in your country or region.',
                'All information provided during registration is accurate and truthful.',
                'You will not impersonate another person or create fake identities for fraudulent or harmful purposes.',
              ]}
            />
            <p>
              The platform reserves the right to suspend or permanently terminate accounts suspected of
              violating age or identity requirements.
            </p>
          </Section>

          <Section n={2} title="User Responsibility">
            <p>You are fully responsible for:</p>
            <List
              items={[
                'All content you upload, share, transmit, or display.',
                'Your conversations, interactions, and behavior with other users.',
                'Any media, messages, or communications exchanged through the platform.',
                'Protecting your account credentials and login information.',
              ]}
            />
            <p>
              The platform does not guarantee the identity, honesty, intentions, or conduct of any user.
              Users interact with others at their own risk.
            </p>
          </Section>

          <Section n={3} title="Consent to Interaction">
            <p>By accepting a follow request or initiating communication:</p>
            <List
              items={[
                'You voluntarily consent to interact with another user.',
                'You understand that profile access, image visibility, and communication features may become available after mutual acceptance.',
                'You acknowledge that accepting a connection does not create any obligation for further communication, personal meetings, or continued interaction.',
                'You may block or remove connections at any time.',
              ]}
            />
          </Section>

          <Section n={4} title="Video Calling Consent">
            <p>The platform may provide private video calling functionality between mutually connected users. By using video calling features, you agree that:</p>
            <List
              items={[
                'Participation is fully voluntary.',
                'You are solely responsible for your conduct during calls.',
                'You will not engage in harassment, threats, exploitation, coercion, blackmail, or illegal activity.',
                'You understand that online interactions involve inherent risks.',
                'The platform does not actively monitor private calls in real time unless legally required or necessary for safety investigations.',
              ]}
            />
          </Section>

          <Section n={5} title="Prohibited Content & Conduct">
            <p className="font-semibold mt-1">Illegal content</p>
            <List
              items={[
                'Any content involving minors or individuals under 18 years of age.',
                'Exploitative, abusive, violent, or criminal material.',
                'Human trafficking, coercion, or non-consensual activity.',
              ]}
            />
            <p className="font-semibold mt-2">Harassment & abuse</p>
            <List
              items={[
                'Threats or intimidation.',
                'Hate speech or discriminatory behavior.',
                'Stalking, blackmail, extortion, or harassment.',
              ]}
            />
            <p className="font-semibold mt-2">Privacy violations</p>
            <List
              items={[
                'Recording video calls without explicit consent.',
                'Sharing private images or conversations without permission.',
                "Publishing another user's personal information.",
              ]}
            />
            <p className="font-semibold mt-2">Fraud & manipulation</p>
            <List
              items={[
                'Catfishing or impersonation.',
                'Scam activity or financial fraud.',
                'Manipulative or deceptive behavior.',
              ]}
            />
            <p>Any violation may result in immediate suspension, permanent bans, or reporting to law enforcement.</p>
          </Section>

          <Section n={6} title="Content Ownership & License">
            <p>
              You retain ownership of the content you upload. By uploading, you grant the platform a
              limited, non-exclusive license to store, process, display, optimize, and moderate your
              content solely for operating and improving the service. You must have the legal right to
              upload any content you share.
            </p>
          </Section>

          <Section n={7} title="Privacy & Data Usage">
            <p>The platform may collect and process account info, uploaded media, device and usage data, and connection and interaction records. This may be used for security, fraud prevention, moderation, platform functionality, and legal compliance.</p>
          </Section>

          <Section n={8} title="Reporting & Moderation">
            <p>Users may report abuse, harassment, illegal content, fake profiles, or safety concerns. The platform reserves the right to review and remove content, restrict features, suspend or terminate accounts, and cooperate with legal authorities.</p>
          </Section>

          <Section n={9} title="No Guarantee of Safety">
            <p>Online interactions carry inherent risks. The platform cannot guarantee the behavior or intentions of other users. Users are responsible for exercising judgment and caution.</p>
          </Section>

          <Section n={10} title="Limitation of Liability">
            <p>To the maximum extent permitted by law, the platform shall not be liable for user-generated content, user conduct, private interactions, damages arising from communications between users, or losses resulting from misuse of the platform.</p>
          </Section>

          <Section n={11} title="Account Suspension & Termination">
            <p>The platform may suspend or terminate accounts without prior notice for violations, illegal activity, abuse, security risks, or attempts to bypass moderation.</p>
          </Section>

          <Section n={12} title="Changes to Terms">
            <p>The platform may update these terms at any time. Continued use constitutes acceptance of revised terms.</p>
          </Section>
        </div>
      </div>

      {/* Declarations */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-700">
          <Lock size={12} /> User declaration
        </p>
        <ul className="space-y-2.5">
          {REQUIRED_DECLARATIONS.map((label, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={checks[i]}
                onClick={() => setChecks((arr) => arr.map((v, idx) => (idx === i ? !v : v)))}
                className={`mt-0.5 w-[18px] h-[18px] border-[1.5px] rounded grid place-items-center shrink-0 cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-tinder/30 ${
                  checks[i] ? 'bg-tinder border-tinder text-white' : 'bg-white border-ink'
                }`}
              >
                {checks[i] && <Check size={13} strokeWidth={3} />}
              </button>
              <span className="text-[13px] text-neutral-700 leading-snug">{label}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 pt-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-700">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your legal name"
              className="px-4 py-2.5 text-sm rounded-xl border border-neutral-300 focus:outline-none focus:border-ink focus:ring-2 focus:ring-black/10 transition"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-700">Date</span>
            <span className="px-4 py-2.5 text-sm rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 tabular-nums whitespace-nowrap">
              {today}
            </span>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-700">Signature</span>
          <input
            type="text"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Type your name as your signature"
            required
            className="px-4 py-2.5 text-sm rounded-xl border border-neutral-300 italic focus:outline-none focus:border-ink focus:ring-2 focus:ring-black/10 transition"
            style={{ fontFamily: 'cursive' }}
          />
        </label>

        {touched && !allChecked && (
          <p className="text-xs text-rose-600">Please confirm all declarations to continue.</p>
        )}
        {touched && allChecked && !nameOk && (
          <p className="text-xs text-rose-600">Please enter your full name.</p>
        )}
        {touched && allChecked && nameOk && !signatureOk && (
          <p className="text-xs text-rose-600">Please type your signature to confirm.</p>
        )}
      </div>

      {error && (
        <div role="alert" className="px-4 py-3 rounded-2xl bg-rose-100 text-rose-800 border border-rose-200 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full px-4 py-3.5 text-base font-semibold rounded-full text-white bg-ink h-[52px] flex items-center justify-center gap-2 hover:bg-neutral-800 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {submitting ? (
          <span className="w-[18px] h-[18px] rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <>
            <Check size={16} strokeWidth={3} /> Agree &amp; create account
          </>
        )}
      </button>

      <p className="text-[11px] text-neutral-500 text-center leading-relaxed">
        By tapping <b>Agree &amp; create account</b> you acknowledge you've read, understood, and accepted the
        terms above. Your IP address and timestamp will be recorded with your consent.
      </p>
    </form>
  );
}

function Section({ n, title, children }) {
  return (
    <section>
      <h3 className="text-sm font-bold text-ink mb-1.5">
        {n}. {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function List({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1 marker:text-tinder">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}
