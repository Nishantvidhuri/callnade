import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mail, User, Check, Sparkles, Plus, Trash2, Camera, X,
  Upload, ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api.js';
import { googleSignIn } from '../services/google.js';
import { useAuthStore } from '../stores/auth.store.js';
import { uploadAvatar, uploadVerification } from '../services/mediaUpload.js';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import SocialButtons from '../components/SocialButtons.jsx';
import { AuthField, IconInput, inputCls } from '../components/AuthField.jsx';
import DateOfBirthInput from '../components/DateOfBirthInput.jsx';
import LiveCaptureModal from '../components/LiveCaptureModal.jsx';
import ConsentForm from '../components/ConsentForm.jsx';

// Gender-tile avatars. Swap the URLs for your own R2-hosted PNGs/SVGs
// once you've uploaded them — or leave as-is and the tiles will fall
// back to the emoji in `GenderTile` if the URL doesn't load. Using
// transparent PNGs / clean white-bg images keeps the cards looking
// like the reference design (label on top, illustration on a soft
// pink wash below).
const GIRL_AVATAR_URL =
  'https://cdn-icons-png.flaticon.com/512/4140/4140047.png';
const BOY_AVATAR_URL =
  'https://cdn-icons-png.flaticon.com/512/4140/4140048.png';

const linkCls = 'text-ink font-bold underline underline-offset-2';
const ctaCls =
  'w-full px-4 py-3.5 text-base font-semibold rounded-full text-white bg-ink h-[52px] flex items-center justify-center hover:bg-neutral-800 active:translate-y-[1px] disabled:opacity-70 disabled:cursor-not-allowed transition';

const blankPackage = () => ({ title: '', description: '', price: '', durationMinutes: '' });

function ageFromIso(iso) {
  if (!iso) return null;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return null;
  const ms = Date.now() - dob.getTime();
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

export default function Signup() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    dateOfBirth: '',
    bio: '',
    // Gender drives the role: 'female' → creator (provider account),
    // 'male' → regular user. Single signup form replaces the previous
    // `?as=creator` URL trick — folks were accidentally creating user
    // accounts when they wanted to be a creator.
    gender: '',
    // Optional — referral code of whoever referred the new user.
    // Pre-fills from `?ref=<code>` so referral links work out of the
    // box. Only collected from regular users; creators don't see this
    // input. Backend silently ignores unknown / banned codes.
    referralCode: params.get('ref') || '',
  });
  // Derived: female users sign up as creators, males as regular users.
  const asCreator = form.gender === 'female';

  const [packages, setPackages] = useState([]);
  // When the user picks "girl" → seed the packages section with one
  // blank package so the creator-specific UI has something to render.
  // Picking "boy" clears it back out.
  useEffect(() => {
    setPackages((curr) => {
      if (asCreator && curr.length === 0) return [blankPackage()];
      if (!asCreator && curr.length) return [];
      return curr;
    });
  }, [asCreator]);
  const [agree, setAgree] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // Two-step signup: 'form' (personal/details) → 'consent' (T&C + declarations).
  const [step, setStep] = useState('form');
  const [selfie, setSelfie] = useState(null); // optional uploaded avatar photo
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [verifyPhoto, setVerifyPhoto] = useState(null); // mandatory live-camera selfie
  const [verifyPreview, setVerifyPreview] = useState(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const selfieInput = useRef();

  // Manage object URL lifecycles so we don't leak memory on swap/unmount.
  useEffect(() => {
    if (!selfie) {
      setSelfiePreview(null);
      return;
    }
    const url = URL.createObjectURL(selfie);
    setSelfiePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selfie]);

  useEffect(() => {
    if (!verifyPhoto) {
      setVerifyPreview(null);
      return;
    }
    const url = URL.createObjectURL(verifyPhoto);
    setVerifyPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [verifyPhoto]);

  const onSelfieFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Please pick a JPG, PNG, or WebP image.');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError('Image is too large (max 8MB).');
      return;
    }
    setError(null);
    setSelfie(f);
  };

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const setPkg = (i, field, value) =>
    setPackages((arr) => arr.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));

  const addPkg = () => setPackages((arr) => [...arr, blankPackage()]);
  const removePkg = (i) => setPackages((arr) => arr.filter((_, idx) => idx !== i));

  // Step 1: validate the details form. If everything's good, advance to the
  // consent stage. The actual API signup happens AFTER they accept.
  const submit = (e) => {
    e.preventDefault();
    if (!agree) return setError('Please accept the Terms to continue.');
    if (!form.dateOfBirth) return setError('Please enter your date of birth.');
    const age = ageFromIso(form.dateOfBirth);
    if (age == null) return setError('Please enter a valid date of birth.');
    if (age < 18) return setError('You must be 18 or older to use callnade.');
    if (asCreator) {
      if (!verifyPhoto) {
        return setError('Please complete the live verification photo before continuing.');
      }
      const validPkgs = packages.filter((p) => p.title && p.price !== '');
      if (validPkgs.length === 0) {
        return setError('Add at least one package with a title and price.');
      }
    }
    setError(null);
    setStep('consent');
    // Scroll to top of the page so the new content is visible from the start.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Step 2: user accepted the consent form. Now do the actual signup +
  // uploads + packages.
  const acceptAndCreate = async ({ fullName, signature, acceptedAt }) => {
    setError(null);
    setLoading(true);
    try {
      const username = deriveUsername(form);
      const displayName = `${form.firstName} ${form.lastName}`.trim();
      const payload = {
        email: form.email,
        username,
        password: form.password,
        displayName,
        ...(form.bio ? { bio: form.bio } : {}),
        ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
        ...(asCreator ? { role: 'provider' } : {}),
        ...(form.referralCode.trim() ? { referralCode: form.referralCode.trim() } : {}),
        // Consent record — sent so the backend can store it alongside the user.
        consent: { fullName, signature, acceptedAt, version: '2026-05-06' },
      };
      const { data } = await api.post('/auth/signup', payload);
      useAuthStore.getState().setAuth(data);

      // Upload the live verification selfie first — this is the photo we'll
      // use to confirm the account is real. Falls back to also seeding the
      // avatar if the user didn't upload a separate one.
      if (verifyPhoto) {
        try {
          await uploadVerification(verifyPhoto);
        } catch {
          /* non-fatal — admin can request another verification later */
        }
      }
      // Optional: a separately-uploaded photo becomes the public avatar.
      // If they didn't upload one, the verification selfie also doubles as
      // the avatar so the profile isn't blank.
      const avatarFile = selfie || verifyPhoto;
      if (avatarFile) {
        try {
          await uploadAvatar(avatarFile);
        } catch {
          /* non-fatal — user can re-upload from profile later */
        }
      }

      if (asCreator) {
        const validPkgs = packages.filter((p) => p.title && p.price !== '');
        for (const p of validPkgs) {
          try {
            await api.post('/packages', {
              title: p.title,
              description: p.description,
              price: Number(p.price) || 0,
              durationMinutes: p.durationMinutes ? Number(p.durationMinutes) : null,
            });
          } catch {
            /* skip failed package; user can add later */
          }
        }
        nav('/settings', { replace: true });
      } else {
        nav('/', { replace: true });
      }
    } catch (err) {
      setError(err.message);
      // Stay on the consent step so the user can retry.
    } finally {
      setLoading(false);
    }
  };

  // Step 2: consent form takes over the AuthLayout.
  if (step === 'consent') {
    return (
      <AuthLayout
        tone="cool"
        size={asCreator ? 'wide' : 'compact'}
        title={asCreator ? 'Almost there, creator' : 'Almost there'}
        subtitle="One last step — review and confirm to finish creating your account."
      >
        <ConsentForm
          defaultName={`${form.firstName} ${form.lastName}`.trim()}
          isCreator={asCreator}
          submitting={loading}
          error={error}
          onBack={() => {
            setError(null);
            setStep('form');
          }}
          onAccept={acceptAndCreate}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      tone="cool"
      size={asCreator ? 'wide' : 'compact'}
      title={asCreator ? 'Join as a Creator' : 'Create an Account'}
      subtitle={
        <>
          Already have an account? <Link to="/login" className={linkCls}>Log in</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {/* Gender selector — drives the role. Required before the rest
            of the form unlocks. Female → creator, male → regular user.
            We don't surface that mapping here on purpose; the creator
            chrome (verification, packages) appears once "girl" is
            picked and that's enough signal. */}
        <Section
          title="I am a…"
          hint="Pick the option that applies to you."
        >
          <div className="grid grid-cols-2 gap-3">
            <GenderTile
              active={form.gender === 'female'}
              onClick={() => set('gender', 'female')}
              imageUrl={GIRL_AVATAR_URL}
              fallbackEmoji="👩"
              label="Girl"
            />
            <GenderTile
              active={form.gender === 'male'}
              onClick={() => set('gender', 'male')}
              imageUrl={BOY_AVATAR_URL}
              fallbackEmoji="👨"
              label="Boy"
            />
          </div>
        </Section>

        {/* Everything below this gate is only relevant once the user
            has picked a side. Saves them from filling fields that
            won't apply. */}
        {!form.gender ? null : (
          <>

        {asCreator && (
          <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full bg-tinder text-white text-xs font-bold shadow-tinder/40">
            <Sparkles size={12} fill="currentColor" /> Creator account
          </div>
        )}

        {asCreator && (
          <Section
            title="Profile & verification"
            hint="Pick a photo for your profile, and take a live selfie so we can confirm you're a real person."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Profile / avatar — optional upload from disk or library */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-3.5 flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => selfieInput.current?.click()}
                  aria-label={selfie ? 'Change profile photo' : 'Upload profile photo'}
                  className="relative w-16 h-16 rounded-full overflow-hidden bg-neutral-100 border-2 border-dashed border-neutral-300 hover:border-brand-400 hover:bg-brand-50 transition group shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-300"
                >
                  {selfiePreview ? (
                    <img
                      src={selfiePreview}
                      alt="Profile preview"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-neutral-400 group-hover:text-brand-500">
                      <Upload size={18} strokeWidth={1.8} />
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-neutral-700">Profile photo</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                    {selfie ? 'Looks good. Tap below to change.' : 'Optional. Pick a flattering shot.'}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => selfieInput.current?.click()}
                      className="px-3 py-1.5 text-[11px] font-semibold rounded-full bg-ink text-white hover:bg-neutral-800 inline-flex items-center gap-1"
                    >
                      <Upload size={11} /> {selfie ? 'Change' : 'Upload'}
                    </button>
                    {selfie && (
                      <button
                        type="button"
                        onClick={() => setSelfie(null)}
                        aria-label="Remove profile photo"
                        className="w-6 h-6 grid place-items-center rounded-full text-neutral-500 hover:text-rose-600 hover:bg-rose-50"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Live verification — mandatory, opens camera modal */}
              <div
                className={`rounded-2xl border p-3.5 flex items-start gap-3 transition ${
                  verifyPhoto
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-rose-200 bg-rose-50/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setLiveOpen(true)}
                  aria-label={verifyPhoto ? 'Retake verification photo' : 'Take live verification photo'}
                  className={`relative w-16 h-16 rounded-full overflow-hidden border-2 group shrink-0 focus:outline-none transition ${
                    verifyPhoto
                      ? 'border-emerald-400 bg-emerald-100'
                      : 'border-dashed border-rose-300 bg-rose-100/60 hover:border-rose-400'
                  }`}
                >
                  {verifyPreview ? (
                    <img
                      src={verifyPreview}
                      alt="Verification preview"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-rose-500">
                      <Camera size={18} strokeWidth={1.8} />
                    </span>
                  )}
                  {verifyPhoto && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 grid place-items-center text-white border-2 border-white">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-neutral-700 inline-flex items-center gap-1">
                    <ShieldCheck size={11} className={verifyPhoto ? 'text-emerald-600' : 'text-rose-500'} />
                    Live verification
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                        verifyPhoto ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {verifyPhoto ? 'Done' : 'Required'}
                    </span>
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                    {verifyPhoto
                      ? 'Real-time selfie captured. You can retake it if you want.'
                      : 'Real-time selfie via your camera. No file uploads.'}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLiveOpen(true)}
                      className={`px-3 py-1.5 text-[11px] font-semibold rounded-full inline-flex items-center gap-1 transition ${
                        verifyPhoto
                          ? 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-tinder text-white hover:brightness-110'
                      }`}
                    >
                      <Camera size={11} /> {verifyPhoto ? 'Retake' : 'Open camera'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <input
              ref={selfieInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={onSelfieFile}
            />
          </Section>
        )}

        {/* Personal info */}
        <Section title="Personal info">
          <div className="grid grid-cols-2 gap-2.5">
            <AuthField label="First name">
              <IconInput
                icon={User}
                placeholder="John"
                autoComplete="given-name"
                required
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
              />
            </AuthField>
            <AuthField label="Last name">
              <IconInput
                icon={User}
                placeholder="Last name"
                autoComplete="family-name"
                required
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
              />
            </AuthField>
          </div>

          <AuthField
            label={asCreator ? 'Date of birth (per government ID)' : 'Date of birth'}
            hint="You must be 18 or older to use callnade"
          >
            <DateOfBirthInput
              value={form.dateOfBirth}
              onChange={(v) => set('dateOfBirth', v)}
              required
            />
            {form.dateOfBirth && ageFromIso(form.dateOfBirth) != null && ageFromIso(form.dateOfBirth) < 18 && (
              <small className="text-rose-600 text-xs">You must be 18 or older.</small>
            )}
          </AuthField>

          <AuthField label="Email">
            <IconInput
              icon={Mail}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </AuthField>

          <AuthField label="Password">
            <PasswordInput
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </AuthField>

          {/* Referral input is regular-user only. Creators don't get
              referred (no commercial reason to incentivise that). */}
          {!asCreator && (
            <AuthField label="Referral code">
              <input
                type="text"
                placeholder="ABCD2345"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={12}
                value={form.referralCode}
                onChange={(e) =>
                  set('referralCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                className={`${inputCls} font-mono tracking-wider`}
              />
            </AuthField>
          )}
        </Section>

        {asCreator && (
          <>
            <Section title="About you">
              <AuthField label="Bio" hint="Tell potential subscribers what you offer (max 280 chars)">
                <textarea
                  rows={3}
                  maxLength={280}
                  value={form.bio}
                  onChange={(e) => set('bio', e.target.value)}
                  placeholder="e.g. Photographer offering portfolio reviews and 1-on-1 sessions."
                  className={`${inputCls} rounded-2xl resize-none`}
                />
              </AuthField>
            </Section>

            <Section
              title="Your packages"
              hint="Set what you offer and your prices. You can add more from Settings later."
            >
              <div className="space-y-3">
                {packages.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-2xl bg-neutral-50 border border-neutral-200 p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-neutral-600">Package {i + 1}</p>
                      {packages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePkg(i)}
                          aria-label="Remove package"
                          className="w-7 h-7 grid place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <input
                      placeholder="Title (e.g. 30-min coaching call)"
                      maxLength={80}
                      value={p.title}
                      onChange={(e) => setPkg(i, 'title', e.target.value)}
                      className={inputCls}
                    />
                    <textarea
                      rows={2}
                      maxLength={500}
                      placeholder="What's included?"
                      value={p.description}
                      onChange={(e) => setPkg(i, 'description', e.target.value)}
                      className={`${inputCls} rounded-2xl resize-none`}
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        type="number"
                        min={0}
                        placeholder="Price (credits)"
                        value={p.price}
                        onChange={(e) => setPkg(i, 'price', e.target.value)}
                        className={inputCls}
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Duration (min, optional)"
                        value={p.durationMinutes}
                        onChange={(e) => setPkg(i, 'durationMinutes', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addPkg}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-dashed border-neutral-300 text-sm font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-400 transition"
                >
                  <Plus size={14} /> Add another package
                </button>
              </div>
            </Section>
          </>
        )}

        {error && (
          <div role="alert" className="px-4 py-3 rounded-2xl bg-rose-100 text-rose-800 border border-rose-200 text-sm">
            {error}
          </div>
        )}

        <button type="submit" className={ctaCls} disabled={loading}>
          {loading ? <Spinner /> : 'Continue'}
        </button>

        <p className="text-[11px] text-neutral-500 text-center leading-relaxed">
          You'll review and accept our terms &amp; community guidelines on the next step.
        </p>

        {!asCreator && (
          <>
            <Divider />
            <SocialButtons
              onGoogle={async () => {
                setError(null);
                setLoading(true);
                try {
                  const idToken = await googleSignIn();
                  const { data } = await api.post('/auth/google', { idToken });
                  useAuthStore.getState().setAuth(data);
                  nav('/', { replace: true });
                } catch (err) {
                  setError(err.message || 'Google sign-in failed');
                } finally {
                  setLoading(false);
                }
              }}
              onFacebook={() => setError('Facebook sign-up coming soon')}
            />
          </>
        )}

          </>
        )}
      </form>

      <LiveCaptureModal
        open={liveOpen}
        onCancel={() => setLiveOpen(false)}
        onCapture={(file) => {
          setVerifyPhoto(file);
          setLiveOpen(false);
        }}
      />
    </AuthLayout>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="space-y-2.5">
      <div>
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

/**
 * Single gender option tile. Mimics the reference UI: label on top,
 * cartoon avatar in the middle, white card with a subtle shadow on
 * the active state.
 *
 * `imageUrl` is preferred — drop a hosted PNG/SVG into the URL
 * constants near the top of this file (typically uploaded to your
 * own R2 bucket so you control the asset). If the image fails to
 * load (404 / CORS / dev-only) the tile falls back to the emoji
 * passed in, so the page never looks empty.
 */
function GenderTile({ active, onClick, imageUrl, fallbackEmoji, label }) {
  const [imgFailed, setImgFailed] = useState(!imageUrl);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition active:scale-[0.98] ${
        active
          ? 'border-brand-500 bg-white shadow-md shadow-brand-200/60'
          : 'border-neutral-200 bg-white hover:border-brand-300'
      }`}
    >
      <span
        className={`text-sm font-bold tracking-wide ${
          active ? 'text-brand-600' : 'text-neutral-500'
        }`}
      >
        {label}
      </span>
      <div className="w-full aspect-square rounded-xl bg-gradient-to-b from-brand-50 to-white grid place-items-center overflow-hidden">
        {imgFailed ? (
          <span className="text-6xl leading-none select-none">{fallbackEmoji}</span>
        ) : (
          <img
            src={imageUrl}
            alt={label}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        )}
      </div>
    </button>
  );
}

function Checkbox({ checked, onChange, children }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink select-none">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="w-[18px] h-[18px] border-[1.5px] border-ink rounded grid place-items-center bg-white shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black/20"
      >
        {checked && <Check size={14} strokeWidth={3} className="text-ink" />}
      </button>
      <span>{children}</span>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-neutral-500 text-xs my-0.5">
      <span className="flex-1 h-px bg-neutral-200" />
      <span>or</span>
      <span className="flex-1 h-px bg-neutral-200" />
    </div>
  );
}

function Spinner() {
  return (
    <span className="w-[18px] h-[18px] rounded-full border-2 border-white/30 border-t-white animate-spin" />
  );
}

function deriveUsername({ firstName, lastName, email }) {
  const base = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18);
  if (base.length >= 3) return `${base}${randomSuffix()}`;
  const local = (email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18);
  return `${local || 'user'}${randomSuffix()}`;
}

function randomSuffix() {
  return String(Math.floor(Math.random() * 9000) + 1000);
}
