import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Lock, Save, LogOut, Wallet, User as UserIcon, Mail, Calendar,
  ShieldCheck, Sparkles, Camera, Plus, ArrowUpRight, Briefcase, Shield,
  Eye, Edit3, X,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { disconnectSocket } from '../services/socket.js';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';
import PackagesManager from '../components/PackagesManager.jsx';
import { fmtCredits } from '../utils/formatCredits.js';

export default function Settings() {
  const nav = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const me = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState(null); // fresh /users/me
  const [form, setForm] = useState({ displayName: '', bio: '', isPrivate: true, isAdult: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showVerifyPhoto, setShowVerifyPhoto] = useState(false);

  useEffect(() => {
    api
      .get('/users/me')
      .then((r) => {
        const u = r.data.user;
        setProfile(u);
        setForm({
          displayName: u.displayName || '',
          bio: u.bio || '',
          isPrivate: !!u.isPrivate,
          isAdult: !!u.isAdult,
        });
        // Refresh the auth-store user too so wallet/earnings are current.
        setUser(u);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [setUser]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.patch('/users/me', form);
      setUser(data);
      setProfile((p) => ({ ...p, ...data }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    useAuthStore.getState().clear();
    disconnectSocket();
    nav('/login', { replace: true });
  };

  const isProvider = me?.role === 'provider';
  const isAdmin = me?.role === 'admin' || me?.isAdmin;

  return (
    <div className="h-[100dvh] flex overflow-hidden bg-neutral-950 text-ink">
      <HomeSidebar me={me} onLogout={handleLogout} />

      <main className="flex-1 flex flex-col min-h-0 bg-[#fff5f9]">
        <MobileTopBar />
        <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 lg:pb-8 space-y-6">
          <button
            onClick={() => nav(-1)}
            aria-label="Back"
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-ink transition"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <header>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">Settings</h1>
            <p className="text-sm text-neutral-500">
              Manage your account, profile, packages, and security.
            </p>
          </header>

          {/* Identity card */}
          {me && (
            <section className="rounded-3xl bg-white border border-neutral-200 p-5 flex items-center gap-4 shadow-sm">
              <button
                onClick={() => nav(`/u/${me.username}`)}
                aria-label="Open my profile"
                className="relative shrink-0 group"
              >
                {me.avatarUrl ? (
                  <img src={me.avatarUrl} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-tinder grid place-items-center text-white text-xl font-bold">
                    {(me.displayName || me.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-white border border-neutral-200 grid place-items-center text-neutral-600 group-hover:text-ink shadow-sm">
                  <Camera size={13} />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-lg truncate">{me.displayName || me.username}</p>
                  <RoleChip role={me.role} isAdmin={me.isAdmin} />
                  {profile?.verifiedAt && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">
                      <ShieldCheck size={11} /> Verified
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-500 truncate">@{me.username}</p>
                <button
                  onClick={() => nav(`/u/${me.username}`)}
                  className="mt-1.5 text-xs font-semibold text-brand-600 hover:underline inline-flex items-center gap-1"
                >
                  View public profile <ArrowUpRight size={12} />
                </button>
              </div>
            </section>
          )}

          {/* Wallet & Earnings */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BalanceCard
              icon="wallet"
              label="Wallet"
              hint="Used to call creators"
              value={me?.walletBalance ?? 0}
              ctaLabel="Top up"
              onCta={() => alert('Top-up coming soon — admin can credit your wallet from /admin for now.')}
            />
            {(isProvider || isAdmin) && (
              <BalanceCard
                icon="earnings"
                label="Earnings"
                hint="Credits you've earned from calls"
                value={me?.earningsBalance ?? 0}
                ctaLabel="Withdraw"
                onCta={() => alert('Withdrawal coming soon — admin can adjust your earnings from /admin.')}
              />
            )}
          </section>

          {/* Account info — read-only details from the API */}
          <SectionCard
            icon={UserIcon}
            title="Account information"
            hint="Read-only. Contact support to change email or date of birth."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <ReadField icon={Mail} label="Email">{profile?.email || '—'}</ReadField>
              <ReadField icon={UserIcon} label="Username">@{profile?.username || me?.username || '—'}</ReadField>
              <ReadField icon={Calendar} label="Date of birth">{fmt(profile?.dateOfBirth) || '—'}</ReadField>
              <ReadField icon={Sparkles} label="Member since">{fmt(profile?.createdAt) || '—'}</ReadField>
            </div>
          </SectionCard>

          {/* Profile editing */}
          <SectionCard
            icon={Edit3}
            title="Profile"
            hint="What other people see when they open your profile."
          >
            {loading ? (
              <p className="text-sm text-neutral-400">Loading…</p>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <Field label="Display name">
                  <input
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    maxLength={60}
                    placeholder="Your name"
                    className={inputCls}
                  />
                </Field>

                <Field label="Bio" hint={`${form.bio.length}/280`}>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    maxLength={280}
                    rows={3}
                    placeholder="Tell people who you are and what you do."
                    className={`${inputCls} rounded-2xl resize-none`}
                  />
                </Field>

                <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-brand-100 grid place-items-center text-brand-600 shrink-0">
                    <Lock size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Private account</p>
                    <p className="text-xs text-neutral-500">
                      Locked photos stay hidden until a follow request is accepted.
                    </p>
                  </div>
                  <Toggle
                    checked={form.isPrivate}
                    onChange={(v) => setForm({ ...form, isPrivate: v })}
                  />
                </div>

                {/* 18+ section disabled for now — keep the markup commented
                    so we can restore it later without re-deriving the logic.
                    The backend `isAdult` field + filter still work, just
                    not exposed via UI. */}
                {/*
                {profile?.role === 'provider' && (
                  <div className="rounded-2xl bg-rose-50/50 border border-rose-200 p-4 flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-rose-500 grid place-items-center text-white shrink-0 text-[11px] font-bold">
                      18+
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Adult content</p>
                      <p className="text-xs text-neutral-600">
                        Mark your profile as 18+. You'll be listed under the 18+ section instead of the regular Discover tab. Subscribers must confirm they're 18+ before viewing.
                      </p>
                    </div>
                    <Toggle
                      checked={form.isAdult}
                      onChange={(v) => setForm({ ...form, isAdult: v })}
                    />
                  </div>
                )}
                */}

                {error && (
                  <p className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm">
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder/30 shadow-md hover:brightness-110 transition disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    <Save size={15} />
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {saved && (
                    <span className="text-sm text-emerald-600 font-semibold inline-flex items-center gap-1">
                      <ShieldCheck size={14} /> Saved
                    </span>
                  )}
                </div>
              </form>
            )}
          </SectionCard>

          {/* Verification & consent */}
          <SectionCard
            icon={ShieldCheck}
            title="Identity & consent"
            hint="Your live verification photo and accepted terms record."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatusRow
                ok={!!profile?.verifiedAt}
                label="Live verification"
                detail={
                  profile?.verifiedAt
                    ? `Verified ${fmt(profile.verifiedAt)} — tap to preview`
                    : 'Not yet verified'
                }
                onClick={
                  profile?.verificationMediaId
                    ? () => setShowVerifyPhoto(true)
                    : undefined
                }
              />
              <StatusRow
                ok={!!(profile?.consent?.acceptedAt || me?.consent?.acceptedAt)}
                label="Terms accepted"
                detail={
                  fmt(profile?.consent?.acceptedAt || me?.consent?.acceptedAt) ||
                  'No record on file'
                }
              />
            </div>
          </SectionCard>

          {/* Packages — providers only */}
          {(isProvider || isAdmin) && (
            <SectionCard icon={Briefcase} title="My packages" hint="Set what you offer and your prices.">
              <div className="-mx-1">
                <PackagesManager />
              </div>
            </SectionCard>
          )}

          {/* Admin shortcut */}
          {isAdmin && (
            <SectionCard icon={Shield} title="Admin tools" hint="Moderate users, calls, and balances.">
              <button
                onClick={() => nav('/admin')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full bg-ink text-white hover:bg-neutral-800 transition"
              >
                <Shield size={14} /> Open admin panel
              </button>
            </SectionCard>
          )}

          {/* Sign out — just a plain action, not a "danger". */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-ink transition"
            >
              <LogOut size={15} /> Log out
            </button>
            <p className="text-[11px] text-neutral-400 ml-auto">
              Need to delete your account? Contact support.
            </p>
          </div>
        </div>
        </div>
      </main>
      <HomeBottomBar />

      {showVerifyPhoto && profile?.verificationMediaId && (
        <VerificationPhotoModal
          mediaId={profile.verificationMediaId}
          verifiedAt={profile.verifiedAt}
          onClose={() => setShowVerifyPhoto(false)}
        />
      )}
    </div>
  );
}

function VerificationPhotoModal({ mediaId, verifiedAt, onClose }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [imgError, setImgError] = useState(null);

  // Fetch the photo with auth (the raw endpoint enforces owner-only for
  // verification-type media). <img src> can't send headers, so we go
  // through axios and render the resulting blob via an object URL.
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/media/${mediaId}/raw?variant=full`, { responseType: 'blob' })
      .then((r) => {
        if (cancelled) return;
        const blob = r.data;
        if (!blob || blob.size === 0) {
          setImgError('Photo is empty.');
          return;
        }
        if (!blob.type?.startsWith('image/')) {
          setImgError('Server returned a non-image response.');
          return;
        }
        setImgUrl(URL.createObjectURL(blob));
      })
      .catch((e) => !cancelled && setImgError(e.message || 'Failed to load photo.'));
    return () => { cancelled = true; };
  }, [mediaId]);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-neutral-950 text-white shadow-2xl overflow-hidden flex flex-col animate-[pop_150ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3.5 border-b border-white/10 flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">Live verification photo</p>
            {verifiedAt && (
              <p className="text-[11px] text-white/50">Captured {fmt(verifiedAt)}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 grid place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>
        <div className="bg-black grid place-items-center min-h-[260px]">
          {imgError ? (
            <p className="text-rose-300 text-sm py-10 px-6 text-center">{imgError}</p>
          ) : !imgUrl ? (
            <p className="text-white/60 text-sm py-10">Loading…</p>
          ) : (
            <img
              src={imgUrl}
              alt="My verification selfie"
              className="max-h-[70dvh] w-auto object-contain"
            />
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/10">
          <p className="text-[11px] text-white/50 leading-relaxed">
            Stored privately — only you and platform admins can view this photo.
          </p>
        </div>
      </div>
      <style>{`@keyframes pop{from{transform:scale(0.94);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

const inputCls =
  'w-full px-4 py-2.5 text-sm rounded-full bg-white border border-neutral-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition';

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-neutral-700">
        {label}
        {hint && <span className="font-medium text-neutral-400 normal-case tabular-nums">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ReadField({ icon: Icon, label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 inline-flex items-center gap-1">
        {Icon && <Icon size={11} />} {label}
      </p>
      <p className="text-sm text-ink truncate mt-0.5">{children}</p>
    </div>
  );
}

function SectionCard({ icon: Icon, title, hint, tone, children }) {
  const toneCls =
    tone === 'danger'
      ? 'border-rose-200 bg-rose-50/40'
      : 'border-neutral-200 bg-white';
  const iconBg =
    tone === 'danger'
      ? 'bg-rose-100 text-rose-600'
      : 'bg-brand-100 text-brand-600';
  return (
    <section className={`rounded-3xl border p-5 sm:p-6 shadow-sm ${toneCls}`}>
      <div className="flex items-start gap-3 mb-4">
        <span className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${iconBg}`}>
          {Icon && <Icon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-base">{title}</h2>
          {hint && <p className="text-xs text-neutral-500 mt-0.5">{hint}</p>}
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function BalanceCard({ icon, label, hint, value, ctaLabel, onCta }) {
  const isEarnings = icon === 'earnings';
  return (
    <div className="rounded-3xl bg-white border border-neutral-200 p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${
            isEarnings ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
          }`}
        >
          <Wallet size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
          <p className={`text-2xl font-bold tabular-nums leading-tight ${isEarnings ? 'text-amber-700' : 'text-emerald-700'}`}>
            {fmtCredits(value)}{' '}
            <span className="text-sm font-medium text-neutral-500">credits</span>
          </p>
        </div>
      </div>
      <p className="text-[11px] text-neutral-500">{hint}</p>
      {ctaLabel && (
        <button
          type="button"
          onClick={onCta}
          className={`inline-flex items-center justify-center gap-1.5 mt-1 px-3.5 py-2 text-xs font-semibold rounded-full transition ${
            isEarnings
              ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/30 shadow-md'
              : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/30 shadow-md'
          }`}
        >
          <Plus size={12} strokeWidth={2.6} /> {ctaLabel}
        </button>
      )}
    </div>
  );
}

function StatusRow({ ok, label, detail, onClick }) {
  const baseCls = `flex items-center gap-3 rounded-2xl border p-3.5 w-full text-left ${
    ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-neutral-200 bg-neutral-50/60'
  } ${onClick ? 'hover:shadow-sm hover:brightness-105 cursor-pointer transition' : ''}`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag {...(onClick ? { type: 'button', onClick } : {})} className={baseCls}>
      <span
        className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${
          ok ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-500'
        }`}
      >
        {ok ? <ShieldCheck size={15} /> : <Eye size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-[11px] text-neutral-500 truncate">{detail}</p>
      </div>
      <span
        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${
          ok ? 'bg-emerald-500 text-white' : 'bg-neutral-300 text-neutral-700'
        }`}
      >
        {ok ? 'OK' : 'PENDING'}
      </span>
    </Tag>
  );
}

function RoleChip({ role, isAdmin }) {
  const r = role || (isAdmin ? 'admin' : 'user');
  const styles = {
    admin: 'bg-brand-100 text-brand-600',
    provider: 'bg-amber-100 text-amber-700',
    user: 'bg-neutral-100 text-neutral-600',
  }[r];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide ${styles}`}
    >
      {r === 'admin' ? <Shield size={10} /> : r === 'provider' ? <Sparkles size={10} fill="currentColor" /> : <UserIcon size={10} />}
      {r}
    </span>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition ${checked ? 'bg-tinder' : 'bg-neutral-300'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

function fmt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
