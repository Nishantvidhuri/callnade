import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Video, Phone, Camera, Lock, BellRing, BellPlus, Check,
  Save, LogOut, Edit3, Receipt, Shield, Package as PackageIcon, X, Plus,
} from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { usePresenceStore } from '../stores/presence.store.js';
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
  // Packages-manager modal — owner-only, only renders for provider
  // accounts. Decoupled from the inline "Edit profile" panel so a
  // creator can jump straight to package management without
  // toggling on the larger settings drawer.
  const [pkgManagerOpen, setPkgManagerOpen] = useState(false);
  // When the creator taps "+ Package" we open the manager with the
  // new-package form already showing. Null = open in list view (the
  // existing "Packages" / edit-drawer entry points).
  const [pkgManagerAutoNew, setPkgManagerAutoNew] = useState(null);
  // Inline-settings state — only used when viewing own profile (isMe).
  const [editing, setEditing] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ displayName: '', bio: '', isPrivate: true, isAdult: false });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const fileInput = useRef();
  const avatarInput = useRef();

  const targetUsername = username || me?.username;
  const isMe = profile && me && profile.user.username === me.username;
  const rel = profile?.relationship || {};

  // Live presence dot — read from the store with the API payload as a
  // fallback for the first paint. Drives the sticky-bottom CTA's
  // disabled state when the creator goes into a call.
  const livePresence = usePresenceStore((s) =>
    profile?.user?._id ? s.byId[String(profile.user._id)] : null,
  );
  const presence = livePresence || profile?.user?.presence || 'offline';

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
          isAdult: !!data.user.isAdult,
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

  // Seed the presence store from the profile payload so the dot /
  // sticky-CTA reflects the right state on first paint, before any
  // socket presence:update arrives.
  useEffect(() => {
    if (profile?.user?._id && profile.user.presence) {
      usePresenceStore.getState().seed(profile.user._id, profile.user.presence);
    }
  }, [profile?.user?._id, profile?.user?.presence]);

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
  // Open the package picker filtered to the chosen call type. Before
  // the picker opens, do a proactive per-minute balance check against
  // the cheapest matching package — the backend only requires one
  // minute's worth of credits to start the call, so we mirror that
  // here. The RechargeModal surfaces only when even one minute is
  // out of reach. Legacy packages with no duration fall back to flat
  // fee (perMinFor returns the full price).
  const startCall = (type = 'video') => {
    const balance = me?.walletBalance ?? 0;
    const perMinFor = (p) =>
      p.durationMinutes && p.durationMinutes > 0 ? p.price / p.durationMinutes : p.price;
    const candidates = (profile.packages || []).filter(
      (p) => (p.callType || 'video') === type && p.price > 0,
    );
    const cheapest = candidates.length
      ? candidates.reduce((min, p) => (perMinFor(p) < perMinFor(min) ? p : min))
      : null;
    if (cheapest && balance < perMinFor(cheapest)) {
      setRecharge({ required: perMinFor(cheapest), balance });
      return;
    }
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

  // When a regular user is viewing a creator, hop the gallery up so it
  // appears immediately after the Subscribe / call action row (and
  // before packages), matching a dating-app reading order: identity →
  // subscribe → photos → booking options. On own / non-creator views
  // the gallery stays in its original spot near the bottom.
  const isCreatorProfile = profile.user.role === 'provider';
  const showInlineGallery = !isMe && isCreatorProfile;
  const showStickyCallCTA = !isMe && isCreatorProfile && me?.role !== 'provider';

  return (
    <Shell stickyOffset={showStickyCallCTA}>
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
            {/* Packages — provider-only. Two entry points:
                  · "+ Package"   → opens PackagesManager with the new-
                                    package form already showing (one
                                    tap to create).
                  · The package icon (no plus) → opens the manager in
                                    list view so the creator can edit /
                                    delete existing packages.
                Both reuse the same modal, just toggling `autoNew`. */}
            {profile.user.role === 'provider' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPkgManagerAutoNew('video');
                    setPkgManagerOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg text-white bg-tinder shadow-md shadow-tinder/30 hover:brightness-110 transition"
                  title="Create a new call package"
                >
                  <Plus size={14} strokeWidth={2.8} /> Package
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPkgManagerAutoNew(null);
                    setPkgManagerOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-brand-200 text-brand-600 bg-brand-50 hover:bg-brand-100 transition"
                  title="Manage existing packages"
                >
                  <PackageIcon size={14} /> Packages
                </button>
              </>
            )}
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

      {/* Inline gallery — sits right after the action row on creator
          profiles so the viewer sees: identity → subscribe → photos
          → packages, in that order. Skipped on own/non-creator views
          (the bottom Gallery render handles those). */}
      {showInlineGallery && (
        <div className="mb-8">
          <Gallery items={profile.gallery} onSlotClick={onSlotClick} isOwner={isMe} />
        </div>
      )}

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

            {/* 18+ toggle — creator-only. Decides which discover
                bucket the creator's profile lands in on /. Off (the
                default) keeps them in the regular Discover tab; on
                moves them to the 18+ tab. Backend `updateMe` already
                drops this field for non-providers, so even if the
                toggle leaked into a regular user's UI the change
                wouldn't take effect. */}
            {profile.user.role === 'provider' && (
              <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-rose-100 grid place-items-center text-rose-600 shrink-0 text-[11px] font-bold">
                  18+
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Adult content mode</p>
                  <p className="text-xs text-neutral-500">
                    {settingsForm.isAdult
                      ? 'Your profile appears in the 18+ tab. Only viewers who confirm 18+ see you.'
                      : 'Your profile appears in the regular Discover tab.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settingsForm.isAdult}
                  onClick={() => setSettingsForm({ ...settingsForm, isAdult: !settingsForm.isAdult })}
                  className={`relative w-11 h-6 rounded-full transition ${
                    settingsForm.isAdult ? 'bg-rose-500' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
                      settingsForm.isAdult ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            )}

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

      {!showInlineGallery && (
        <Gallery items={profile.gallery} onSlotClick={onSlotClick} isOwner={isMe} />
      )}

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

      {/* Owner-only: full-screen Packages manager modal. Reuses the
          same PackagesManager that the inline Edit-profile drawer
          embeds; this button just gives a faster path to it. */}
      {pkgManagerOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-end sm:place-items-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl flex flex-col max-h-[90dvh] sm:max-h-[85dvh] overflow-hidden animate-[pop_150ms_ease-out]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-200">
              <div className="inline-flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 grid place-items-center">
                  <PackageIcon size={16} />
                </span>
                <p className="font-bold text-base">Manage packages</p>
              </div>
              <button
                onClick={() => {
                  setPkgManagerOpen(false);
                  setPkgManagerAutoNew(null);
                }}
                aria-label="Close"
                className="w-8 h-8 grid place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-ink transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <PackagesManager autoNew={pkgManagerAutoNew} />
            </div>
          </div>
          <style>{`@keyframes pop{from{transform:scale(0.96);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
        </div>
      )}

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

      {/* Sticky bottom call CTA — two pills (Audio + Video) so the
          viewer can pick the call type. Each opens the package picker
          filtered to that call type, and the picker drives the
          actual /call/{id} navigation. Sits above HomeBottomBar on
          mobile (the bottom nav is `lg:hidden fixed bottom-0`, so we
          offset by its height there) and at the viewport bottom on
          lg+. Both buttons dim and go no-op when the creator is
          currently in a call. */}
      {showStickyCallCTA && (
        <div className="fixed inset-x-0 bottom-16 lg:bottom-0 z-30 pointer-events-none">
          {/* Two free-floating pills on the page's pink wash — no
              white card behind them. Both buttons share the brand
              palette: outline pink for audio, solid pink for video,
              so the bar reads as one harmonious pair instead of
              clashing colours. */}
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-3 lg:pb-4 pointer-events-auto flex gap-2.5">
            <button
              type="button"
              onClick={() => presence !== 'busy' && startCall('audio')}
              disabled={presence === 'busy'}
              aria-label={
                presence === 'busy'
                  ? `${u.displayName || u.username} is currently in a call`
                  : `Audio call ${u.displayName || u.username}`
              }
              className={`flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition shadow-md ${
                presence === 'busy'
                  ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                  : 'bg-brand-200 text-brand-700 hover:bg-brand-100 active:translate-y-[1px]'
              }`}
            >
              <Phone size={16} strokeWidth={2.2} />
              {presence === 'busy' ? 'In a call' : 'Audio'}
            </button>
            <button
              type="button"
              onClick={() => presence !== 'busy' && startCall('video')}
              disabled={presence === 'busy'}
              aria-label={
                presence === 'busy'
                  ? `${u.displayName || u.username} is currently in a call`
                  : `Video call ${u.displayName || u.username}`
              }
              className={`flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition shadow-md shadow-tinder/30 ${
                presence === 'busy'
                  ? 'bg-neutral-300 text-white cursor-not-allowed'
                  : 'bg-tinder text-white hover:brightness-110 active:translate-y-[1px]'
              }`}
            >
              <Video size={17} strokeWidth={2.2} />
              {presence === 'busy' ? 'In a call' : 'Video'}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, stickyOffset = false }) {
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
          {/* Extra bottom padding when the sticky call CTA is on so
              the last bits of content don't sit underneath it. */}
          <div
            className={`max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 ${
              stickyOffset ? 'pb-44 lg:pb-28' : 'pb-24 lg:pb-8'
            }`}
          >
            {children}
          </div>
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
  // Three flavours of payout share this row:
  //   signup       — one-time bonus the referee got at their signup
  //   topup        — 10% to the referrer when their referee recharged
  //   creator-earn — 10% to the referrer from a referred creator's
  //                  call earnings (only inside the 30-day window)
  // Each gets a distinct title + badge so the user can see at a
  // glance where the credits came from.
  const isSignup = p.kind === 'signup';
  const isCreatorEarn = p.kind === 'creator-earn';
  const titleText = isSignup
    ? p.peerUsername
      ? `Signup bonus · @${p.peerUsername}`
      : 'Signup bonus'
    : isCreatorEarn
    ? p.peerUsername
      ? `Creator call · @${p.peerUsername}`
      : 'Creator call'
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
          {isCreatorEarn && (
            <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-fuchsia-100 text-fuchsia-700 align-middle">
              creator 10%
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
