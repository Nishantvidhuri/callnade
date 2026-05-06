import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Video, Camera, Lock, BellRing, BellPlus, Check } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { useChatStore } from '../stores/chat.store.js';
import { uploadAvatar, uploadGalleryImage } from '../services/mediaUpload.js';
import { enterFullscreenOnMobile } from '../utils/fullscreen.js';
import Gallery from '../components/Gallery.jsx';
import HomeSidebar from '../components/HomeSidebar.jsx';
import HomeBottomBar from '../components/HomeBottomBar.jsx';
import { disconnectSocket } from '../services/socket.js';
import RechargeModal from '../components/RechargeModal.jsx';
import AdminProfileInsert from '../components/AdminProfileInsert.jsx';

export default function Profile() {
  const { username } = useParams();
  const nav = useNavigate();
  const me = useAuthStore((s) => s.user);
  const openChatWith = useChatStore((s) => s.openChatWith);

  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingPos, setPendingPos] = useState(null);
  const [recharge, setRecharge] = useState(null); // { required, balance } | null
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
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    setProfile(null);
    setError(null);
    load();
  }, [targetUsername]);

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

  const message = () => {
    openChatWith({
      id: String(profile.user._id),
      username: profile.user.username,
      displayName: profile.user.displayName,
      avatarUrl: profile.avatar?.urls?.thumb || null,
    });
  };

  const startCall = () => {
    enterFullscreenOnMobile();
    nav(`/call/${profile.user._id}`);
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
            <span><strong className="font-semibold">{format(u.followerCount)}</strong> <span className="text-neutral-500">subscribers</span></span>
            <span><strong className="font-semibold">{format(u.followingCount)}</strong> <span className="text-neutral-500">subscribed</span></span>
            {u.isPrivate && <span className="text-xs text-neutral-500 inline-flex items-center gap-1"><Lock size={12} /> Private</span>}
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {isMe ? (
          <Link
            to="/settings"
            className="px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition"
          >
            Edit profile
          </Link>
        ) : (
          <>
            <SubscribeButton rel={rel} busy={busy} onSubscribe={subscribe} onUnsubscribe={unsubscribe} />
            <button
              onClick={message}
              title="Send message"
              className="px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition inline-flex items-center gap-2"
            >
              <MessageSquare size={15} /> Message
            </button>
            {me?.role !== 'provider' && (
              <button
                onClick={startCall}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 hover:bg-neutral-50 transition inline-flex items-center gap-2"
              >
                <Video size={15} /> Call
              </button>
            )}
          </>
        )}
      </div>

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
                  <p className="font-semibold text-sm">{p.title}</p>
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
                        nav(`/call/${profile.user._id}?package=${p.id}`);
                      }}
                      className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-full text-white bg-tinder shadow-tinder/30 hover:brightness-110 transition"
                    >
                      <Video size={13} /> Start call
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
      <main className="flex-1 min-h-0 overflow-y-auto bg-[#fff5f9]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 lg:pb-8">{children}</div>
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
