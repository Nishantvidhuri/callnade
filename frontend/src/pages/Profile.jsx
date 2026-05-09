import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Video, Phone, Camera, Lock, BellRing, BellPlus, Check,
  Save, LogOut, Edit3, Receipt, Shield,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { uploadAvatar, uploadGalleryImage } from '../services/mediaUpload.js';
import { enterFullscreenOnMobile } from '../utils/fullscreen.js';
import Gallery from '../components/Gallery.jsx';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import { disconnectSocket } from '../services/socket.js';
import RechargeModal from '../components/RechargeModal.jsx';
import AdminProfileInsert from '../components/AdminProfileInsert.jsx';
import PackagePickerModal from '../components/PackagePickerModal.jsx';
import PackagesManager from '../components/PackagesManager.jsx';
import MobileTopBar from '../components/MobileTopBar.jsx';

export default function Profile() {
  const { username } = useParams();
  const nav = useNavigate();
  const me = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingPos, setPendingPos] = useState(null);
  const [recharge, setRecharge] = useState(null); // { required, balance } | null
  // Package picker is opened by the Audio/Video buttons in the header.
  // `pickerCallType` filters the modal so only audio packages show when
  // they tapped Audio (and same for Video).
  const [pickerCallType, setPickerCallType] = useState(null); // 'audio' | 'video' | null
  // Inline-settings state — only used when viewing own profile (isMe).
  const [editing, setEditing] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ displayName: '', bio: '', isPrivate: true });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const fileInput = useRef();
  const avatarInput = useRef();

  const targetUsername = username || me?.username;
  const isMe = profile && me && profile.user.username === me.username;
  const rel = profile?.relationship || {};

  const load = async () => {
    if (!targetUsername) return;
    try {
      const { data } = await api.get(`/users/${targetUsername}`);
      setProfile(data);
      // If we're viewing our own profile, prime the settings form so the
      // inline edit panel has the right starting values.
      if (me && data.user.username === me.username) {
        setSettingsForm({
          displayName: data.user.displayName || '',
          bio: data.user.bio || '',
          isPrivate: !!data.user.isPrivate,
        });
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    setProfile(null);
    setError(null);
    setEditing(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUsername]);

  const saveSettings = async (e) => {
    e?.preventDefault?.();
    setSavingSettings(true);
    setSettingsSaved(false);
    setError(null);
    try {
      const { data } = await api.patch('/users/me', settingsForm);
      useAuthStore.getState().setUser(data);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
      // Refresh the profile so the rendered display name / bio update too.
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    useAuthStore.getState().clear();
    disconnectSocket();
    nav('/login', { replace: true });
  };

  const subscribe = async () => {
    setBusy(true);
    try {
      await api.post(`/follow/request/${profile.user._id}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      await api.delete(`/follow/${profile.user._id}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Open the package picker filtered to the chosen call type. The user
  // picks a package from the modal, which then triggers startWithPackage.
  const startCall = (type = 'video') => {
    setPickerCallType(type);
  };

  const startWithPackage = (packageId, packageCallType) => {
    enterFullscreenOnMobile();
    const params = new URLSearchParams({
      type: packageCallType || pickerCallType || 'video',
      peer: profile.user.username,
    });
    if (packageId) params.set('package', packageId);
    nav(`/call/${profile.user._id}?${params.toString()}`);
  };

  const onSlotClick = async (pos, existing) => {
    if (!isMe) {
      if (existing && !existing.locked && existing.urls.full) {
        const r = await api.get(`/media/${existing.id}/signed?variant=full`);
        window.open(r.data.url, '_blank');
      }
      return;
    }
    setPendingPos(pos);
    fileInput.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || pendingPos == null) return;
    setBusy(true);
    try {
      await uploadGalleryImage(file, pendingPos);
      setTimeout(load, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setPendingPos(null);
    }
  };

  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await uploadAvatar(file);
      setTimeout(load, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !profile) {
    return (
      <Shell>
        <p className="text-sm text-rose-600">{error}</p>
      </Shell>
    );
  }

  if (!profile) {
    return (
      <Shell>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-full bg-neutral-100 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 bg-neutral-100 rounded animate-pulse" />
            <div className="h-3 w-24 bg-neutral-100 rounded animate-pulse" />
          </div>
        </div>
      </Shell>
    );
  }

  const u = profile.user;

  return (
    <Shell>
      <button
        onClick={() => nav(-1)}
        aria-label="Back"
        className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-ink mb-6 transition"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <header className="flex items-start gap-4 sm:gap-5 mb-6">
        <div className="relative shrink-0">
          {profile.avatar?.urls?.thumb ? (
            <img
              src={profile.avatar.urls.thumb}
              alt=""
              className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover bg-neutral-100"
            />
          ) : (
            <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-brand-100 grid place-items-center text-2xl sm:text-3xl font-medium text-brand-500">
              {(u.displayName || u.username).charAt(0).toUpperCase()}
            </div>
          )}
          {isMe && (
            <button
              onClick={() => avatarInput.current?.click()}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white border border-neutral-200 grid place-items-center text-neutral-600 hover:text-ink shadow-sm"
              aria-label="Change avatar"
            >
              <Camera size={14} />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
              {u.displayName || u.username}
            </h1>
            {rel.isFollower && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-tinder text-white shadow-tinder/40">
                <Check size={12} strokeWidth={3} /> Subscribed
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 truncate">@{u.username}</p>
          {u.bio && <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{u.bio}</p>}
          <div className="mt-3 flex items-center gap-5 text-sm">
            {/* Subscriber stats are only meaningful for creators. Hide
                the counts on regular-user profiles entirely. */}
            {u.role === 'provider' && (
              <>
                <span><strong className="font-semibold">{format(u.followerCount)}</strong> <span className="text-neutral-500">subscribers</span></span>
                <span><strong className="font-semibold">{format(u.followingCount)}</strong> <span className="text-neutral-500">subscribed</span></span>
              </>
            )}
            {u.isPrivate && <span className="text-xs text-neutral-500 inline-flex items-center gap-1"><Lock size={12} /> Private</span>}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {isMe ? (
          <>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition"
            >
              <Edit3 size={14} /> {editing ? 'Close edit' : 'Edit profile'}
            </button>
            <Link
              to="/billing"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition"
            >
              <Receipt size={14} /> Billing
            </Link>
            {(me?.role === 'admin' || me?.isAdmin) && (
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-brand-200 text-brand-600 bg-brand-50 hover:bg-brand-100 transition"
              >
                <Shield size={14} /> Admin
              </Link>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-rose-600 transition"
            >
              <LogOut size={14} /> Log out
            </button>
          </>
        ) : (
          <>
            {/* Subscribe button only renders for creator profiles. You
                don't subscribe to regular users. */}
            {profile.user.role === 'provider' && (
              <SubscribeButton rel={rel} busy={busy} onSubscribe={subscribe} onUnsubscribe={unsubscribe} />
            )}
            {/* Below sm: icon-only square buttons. sm+: pill with label.
                Touch target stays a comfortable ~40px on mobile. */}
            {me?.role !== 'provider' && (
              <>
                <button
                  onClick={() => startCall('audio')}
                  title="Audio call"
                  aria-label="Audio call"
                  className="w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 grid place-items-center sm:inline-flex sm:items-center sm:gap-2 text-sm font-medium rounded-full sm:rounded-lg border border-neutral-200 hover:bg-neutral-50 transition shrink-0"
                >
                  <Phone size={16} />
                  <span className="hidden sm:inline">Audio</span>
                </button>
                <button
                  onClick={() => startCall('video')}
                  title="Video call"
                  aria-label="Video call"
                  className="w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 grid place-items-center sm:inline-flex sm:items-center sm:gap-2 text-sm font-medium rounded-full sm:rounded-lg border border-neutral-200 hover:bg-neutral-50 transition shrink-0"
                >
                  <Video size={16} />
                  <span className="hidden sm:inline">Video</span>
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Referral card — owner-only. Shows the user's own random
          referral code, count of people they've referred, and lifetime
          earnings. If the user was themselves referred by someone,
          we ALSO render their referrer's @handle plus a payout-sent
          history (how much went to their referrer, no top-up amounts
          exposed). */}
      {isMe && me?.referralCode && (
        <ReferralCard
          code={me.referralCode}
          referralCount={me.referralCount || 0}
          referralEarnings={me.referralEarnings || 0}
          referralWalletBalance={me.referralWalletBalance || 0}
          referrer={me.referrer || null}
        />
      )}

      {/* Inline settings — only the owner can see this, only when "Edit
          profile" is toggled on. Settings page is merged into the profile
          here so there's no separate /settings destination. */}
      {isMe && editing && (
        <section className="mb-8 rounded-3xl bg-white border border-neutral-200 p-5 sm:p-6 space-y-5">
          <header className="flex items-center gap-2">
            <Edit3 size={16} className="text-brand-500" />
            <h2 className="font-bold text-base">Edit profile</h2>
          </header>

          <form onSubmit={saveSettings} className="space-y-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wide text-neutral-700">Display name</span>
              <input
                value={settingsForm.displayName}
                onChange={(e) => setSettingsForm({ ...settingsForm, displayName: e.target.value })}
                maxLength={60}
                placeholder="Your name"
                className="w-full px-4 py-2.5 text-sm rounded-full bg-white border border-neutral-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-neutral-700">
                Bio
                <span className="font-medium text-neutral-400 normal-case tabular-nums">
                  {settingsForm.bio.length}/280
                </span>
              </span>
              <textarea
                rows={3}
                maxLength={280}
                value={settingsForm.bio}
                onChange={(e) => setSettingsForm({ ...settingsForm, bio: e.target.value })}
                placeholder="Tell people who you are."
                className="w-full px-4 py-2.5 text-sm rounded-2xl bg-white border border-neutral-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition resize-none"
              />
            </label>

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
              <button
                type="button"
                role="switch"
                aria-checked={settingsForm.isPrivate}
                onClick={() => setSettingsForm({ ...settingsForm, isPrivate: !settingsForm.isPrivate })}
                className={`relative w-11 h-6 rounded-full transition ${
                  settingsForm.isPrivate ? 'bg-tinder' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
                    settingsForm.isPrivate ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2.5 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder/30 shadow-md hover:brightness-110 transition disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Save size={15} />
                {savingSettings ? 'Saving…' : 'Save changes'}
              </button>
              {settingsSaved && (
                <span className="text-sm text-emerald-600 font-semibold inline-flex items-center gap-1">
                  <Check size={14} /> Saved
                </span>
              )}
            </div>
          </form>

          {(profile.user.role === 'provider' || me?.role === 'admin' || me?.isAdmin) && (
            <div className="-mx-1 pt-2 border-t border-neutral-200">
              <PackagesManager />
            </div>
          )}
        </section>
      )}

      {/* Admin-only: verification photo + consent record on any other user. */}
      {!isMe && (me?.role === 'admin' || me?.isAdmin) && (
        <AdminProfileInsert userId={profile.user._id} />
      )}

      {!!profile.packages?.length && (
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span>Packages</span>
            {u.role === 'provider' && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Provider
              </span>
            )}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profile.packages.map((p) => {
              const canStartCall = me?.role !== 'provider';
              // No subscription gate — anyone can book a package call.
              const callable = !isMe && p.durationMinutes > 0 && canStartCall;
              const perMin = p.durationMinutes ? (p.price / p.durationMinutes) : null;
              return (
                <li
                  key={p.id}
                  className="rounded-2xl bg-white border border-neutral-200 p-4 flex flex-col"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{p.title}</p>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${
                        p.callType === 'audio'
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-brand-100 text-brand-600'
                      }`}
                    >
                      {p.callType === 'audio' ? <Phone size={9} /> : <Video size={9} />}
                      {p.callType === 'audio' ? 'Audio' : 'Video'}
                    </span>
                  </div>
                  {p.description && <p className="text-xs text-neutral-500 mt-1 line-clamp-3">{p.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-base font-bold text-emerald-600 tabular-nums">
                      {p.price} <span className="text-xs text-neutral-500 font-medium">credits</span>
                    </span>
                    {p.durationMinutes != null && (
                      <span className="text-xs text-neutral-500">{p.durationMinutes} min</span>
                    )}
                  </div>
                  {perMin != null && (
                    <p className="text-[11px] text-neutral-400 mt-1">≈ {perMin.toFixed(1)} credits/min</p>
                  )}
                  {callable && (
                    <button
                      onClick={() => {
                        const balance = me?.walletBalance ?? 0;
                        if (balance < p.price) {
                          setRecharge({ required: p.price, balance });
                          return;
                        }
                        enterFullscreenOnMobile();
                        const qs = new URLSearchParams({
                          package: p.id,
                          type: p.callType === 'audio' ? 'audio' : 'video',
                          peer: profile.user.username,
                        });
                        nav(`/call/${profile.user._id}?${qs.toString()}`);
                      }}
                      className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full text-white bg-tinder shadow-tinder/30 hover:brightness-110 transition"
                    >
                      {p.callType === 'audio' ? <Phone size={13} /> : <Video size={13} />}
                      Start call
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Gallery items={profile.gallery} onSlotClick={onSlotClick} isOwner={isMe} />

      {!isMe && !rel.canViewLocked && (
        <p className="mt-6 text-xs text-neutral-500 text-center">
          {rel.hasPendingRequest
            ? 'Subscription request sent. The full gallery unlocks once accepted.'
            : 'Subscribe to unlock the full gallery.'}
        </p>
      )}

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
      <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onAvatarFile} />

      <RechargeModal
        open={!!recharge}
        balance={recharge?.balance || 0}
        required={recharge?.required || 0}
        onClose={() => setRecharge(null)}
      />

      <PackagePickerModal
        peer={{
          id: profile.user._id,
          username: profile.user.username,
          displayName: profile.user.displayName,
          avatarUrl: profile.avatar?.urls?.thumb || null,
        }}
        open={!!pickerCallType}
        callTypeFilter={pickerCallType}
        onClose={() => setPickerCallType(null)}
        onStart={(packageId, packageCallType) => startWithPackage(packageId, packageCallType)}
      />
    </Shell>
  );
}

function Shell({ children }) {
  const me = useAuthStore((s) => s.user);
  const nav = useNavigate();
  const onLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    useAuthStore.getState().clear();
    disconnectSocket();
    nav('/login', { replace: true });
  };
  return (
    <div className="h-[100dvh] flex overflow-hidden bg-neutral-950 text-ink">
      <HomeSidebar me={me} onLogout={onLogout} />
      <main className="flex-1 flex flex-col min-h-0 bg-[#fff5f9]">
        <MobileTopBar />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 lg:pb-8">{children}</div>
        </div>
      </main>
      <HomeBottomBar />
    </div>
  );
}

function SubscribeButton({ rel, busy, onSubscribe, onUnsubscribe }) {
  if (rel.isFollower) {
    return (
      <button
        onClick={onUnsubscribe}
        disabled={busy}
        className="px-5 py-2 text-sm font-semibold rounded-full border border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100 transition disabled:opacity-50 inline-flex items-center gap-2 group"
      >
        <BellRing size={15} fill="currentColor" strokeWidth={1.5} />
        <span className="group-hover:hidden">Subscribed</span>
        <span className="hidden group-hover:inline">Unsubscribe</span>
      </button>
    );
  }
  if (rel.hasPendingRequest) {
    return (
      <button
        disabled
        className="px-5 py-2 text-sm font-medium rounded-full border border-neutral-200 text-neutral-500 disabled:cursor-not-allowed inline-flex items-center gap-2"
      >
        <BellRing size={15} strokeWidth={1.8} /> Pending
      </button>
    );
  }
  return (
    <button
      onClick={onSubscribe}
      disabled={busy}
      className="px-5 py-2 text-sm font-semibold rounded-full text-white bg-tinder shadow-tinder hover:brightness-110 transition disabled:opacity-50 inline-flex items-center gap-2"
    >
      <BellPlus size={15} strokeWidth={2.4} /> Subscribe
    </button>
  );
}

function format(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * Owner-only card on the profile page. Shows the user's randomly-
 * generated referral code (assigned at signup), the count of people
 * they've referred, and lifetime credits earned via referrals. Each
 * top-up by a referred user pays the referrer 10% automatically.
 */
function ReferralCard({ code, referralCount, referralEarnings, referralWalletBalance, referrer }) {
  const [copied, setCopied] = useState(null); // 'code' | 'link' | null
  // Two histories: 'received' (you got money) and 'sent' (you triggered
  // payouts to your referrer). Each lazy-loaded the first time the
  // matching panel is expanded.
  const [payouts, setPayouts] = useState({ received: [], sent: [] });
  const [showHistory, setShowHistory] = useState({ received: false, sent: false });
  const [loadingHistory, setLoadingHistory] = useState({ received: false, sent: false });

  const loadHistory = async (direction) => {
    if (payouts[direction].length || loadingHistory[direction]) {
      setShowHistory((s) => ({ ...s, [direction]: !s[direction] }));
      return;
    }
    setLoadingHistory((s) => ({ ...s, [direction]: true }));
    try {
      const { data } = await api.get('/wallet/referral-payouts', {
        params: { limit: 30, direction },
      });
      setPayouts((p) => ({ ...p, [direction]: data.items || [] }));
      setShowHistory((s) => ({ ...s, [direction]: true }));
    } catch {
      /* swallow — empty history is fine */
    } finally {
      setLoadingHistory((s) => ({ ...s, [direction]: false }));
    }
  };

  const link =
    typeof window !== 'undefined'
      ? `${window.location.origin}/signup?ref=${encodeURIComponent(code)}`
      : `/signup?ref=${encodeURIComponent(code)}`;

  const copy = async (text, kind) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  const fmt = (n) =>
    typeof n === 'number' && Number.isFinite(n)
      ? Number.isInteger(n)
        ? String(n)
        : n.toFixed(2)
      : '0';
  const canWithdraw = (referralWalletBalance || 0) >= 1;

  return (
    <section className="mb-6 rounded-2xl bg-white border border-neutral-200 p-4 sm:p-5">
      {/* Title row */}
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-bold text-sm tracking-tight">Refer & earn</h2>
        <span className="text-[11px] text-neutral-500">10% of friends' top-ups</span>
      </div>

      {/* Three small inline stats. Wraps to two-up on very narrow
          screens via flex-wrap; collapses cleanly without the boxy
          colored tiles the previous version had. */}
      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 mb-4">
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wide font-bold text-neutral-500">
            Referrals
          </dt>
          <dd className="text-base font-bold tabular-nums text-ink">{referralCount}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wide font-bold text-neutral-500">
            Lifetime
          </dt>
          <dd className="text-base font-bold tabular-nums text-emerald-700">
            ₹{fmt(referralEarnings)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wide font-bold text-neutral-500">
            Withdrawable
          </dt>
          <dd className="text-base font-bold tabular-nums text-amber-700">
            ₹{fmt(referralWalletBalance)}
          </dd>
        </div>
      </dl>

      {/* Code + actions. Mono code on a tinted pill, primary action
          (Copy) right next to it. The full URL row lives below as a
          secondary action — only the code matters at a glance. */}
      <div className="flex items-center gap-2 mb-2">
        <code className="flex-1 min-w-0 px-3 py-2 text-sm font-mono tracking-wider rounded-lg bg-neutral-50 border border-neutral-200 text-ink truncate">
          {code}
        </code>
        <button
          type="button"
          onClick={() => copy(code, 'code')}
          aria-label="Copy referral code"
          className="px-3 py-2 text-xs font-bold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition shrink-0"
        >
          {copied === 'code' ? '✓' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => copy(link, 'link')}
          aria-label="Copy referral link"
          className="px-3 py-2 text-xs font-semibold rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition shrink-0"
        >
          {copied === 'link' ? '✓' : 'Link'}
        </button>
      </div>

      {/* Withdraw — only renders when there's actually something to
          take out, so the card doesn't push a dead button at zero. */}
      {canWithdraw && (
        <Link
          to="/billing?withdraw=referral"
          className="mt-3 inline-flex items-center justify-center gap-1.5 w-full px-4 py-2 text-xs font-bold rounded-full text-white bg-amber-500 hover:bg-amber-600 shadow-sm transition"
        >
          Withdraw ₹{fmt(referralWalletBalance)}
        </Link>
      )}

      {/* Earnings history (RECEIVED). Credits THIS user got from
          friends' top-ups. Source top-up amount intentionally absent. */}
      <div className="mt-4 pt-4 border-t border-neutral-100">
        <button
          type="button"
          onClick={() => loadHistory('received')}
          className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
        >
          {showHistory.received ? '▾' : '▸'}{' '}
          {showHistory.received ? 'Hide payouts to me' : 'Show payouts to me'}
          {loadingHistory.received && <span className="text-neutral-400">· loading…</span>}
        </button>

        {showHistory.received && (
          <div className="mt-3">
            {payouts.received.length === 0 ? (
              <p className="text-xs text-neutral-500 py-3 text-center">
                No referral payouts yet — share your code to start earning.
              </p>
            ) : (
              <ul className="rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden bg-white">
                {payouts.received.map((p) => (
                  <PayoutRow key={p.id} p={p} sign="+" tone="emerald" />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Referrer block — only shows if THIS user was referred by
          someone. Surfaces who their referrer is + a history of
          payouts that went to the referrer because of THIS user's
          top-ups. The user sees only the payout amount sent (10% of
          their own recharge), never any back-derivation of the
          referrer's wider wallet activity. */}
      {referrer && (
        <div className="mt-4 pt-4 border-t border-neutral-100">
          <p className="text-xs text-neutral-500">
            Referred by{' '}
            <Link
              to={`/u/${referrer.username}`}
              className="font-semibold text-ink hover:underline"
            >
              @{referrer.username}
            </Link>
          </p>
          <button
            type="button"
            onClick={() => loadHistory('sent')}
            className="mt-1.5 text-xs font-semibold text-amber-700 hover:underline inline-flex items-center gap-1"
          >
            {showHistory.sent ? '▾' : '▸'}{' '}
            {showHistory.sent ? `Hide payouts to @${referrer.username}` : `Show payouts to @${referrer.username}`}
            {loadingHistory.sent && <span className="text-neutral-400">· loading…</span>}
          </button>

          {showHistory.sent && (
            <div className="mt-3">
              {payouts.sent.length === 0 ? (
                <p className="text-xs text-neutral-500 py-3 text-center">
                  No payouts triggered yet — they'll appear here once your
                  top-ups are approved.
                </p>
              ) : (
                <ul className="rounded-2xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden bg-white">
                  {payouts.sent.map((p) => (
                    <PayoutRow key={p.id} p={p} sign="→" tone="amber" />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * One row in either history list. The peer's username is whoever's on
 * the OTHER side of the payout (referee for received, referrer for
 * sent). Only the payout amount renders — never the source top-up.
 */
function PayoutRow({ p, sign, tone }) {
  const cls =
    tone === 'amber' ? 'text-amber-700' : 'text-emerald-700';
  // Signup bonus rows tell a different story than the regular 10%
  // top-up payouts — label them so the user can see which is which.
  const isSignup = p.kind === 'signup';
  const titleText = isSignup
    ? p.peerUsername
      ? `Signup bonus · @${p.peerUsername}`
      : 'Signup bonus'
    : p.peerUsername
    ? `@${p.peerUsername}`
    : 'Referral';
  return (
    <li className="flex items-center justify-between px-3 py-2.5 text-xs">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink truncate">{titleText}</p>
        <p className="text-[11px] text-neutral-500">
          {isSignup && (
            <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-emerald-100 text-emerald-700 align-middle">
              from referral
            </span>
          )}
          {fmtPayoutDate(p.createdAt)}
        </p>
      </div>
      <span className={`font-bold tabular-nums shrink-0 ${cls}`}>
        {sign}
        {p.amount}
      </span>
    </li>
  );
}

function fmtPayoutDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
