import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Video } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import { useLoginPromptStore } from '../stores/loginPrompt.store.js';
import { usePresenceStore } from '../stores/presence.store.js';
import PackagePickerModal from './PackagePickerModal.jsx';

export default function UserCard({ user }) {
  const me = useAuthStore((s) => s.user);
  const showPrompt = useLoginPromptStore((s) => s.show);
  const nav = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Seed the presence store with whatever the API gave us so the dot
  // is correct on first paint. Real-time updates from the socket will
  // overwrite this whenever the creator's state actually changes.
  // Falls back to deriving from the legacy `online` boolean for
  // payloads that haven't been re-deployed yet.
  useEffect(() => {
    const initial =
      user?.presence ||
      (user?.online ? 'online' : null);
    if (user?.id && initial) {
      usePresenceStore.getState().seed(user.id, initial);
    }
  }, [user?.id, user?.presence, user?.online]);

  // Live status — falls back to the same seed value if no socket
  // event has arrived yet. Drives both the corner dot and the
  // top-right LIVE / busy badge below.
  const status = usePresenceStore((s) =>
    s.byId[String(user?.id)] ??
    user?.presence ??
    (user?.online ? 'online' : 'offline'),
  );

  const onClick = (e) => {
    if (!me) {
      e.preventDefault();
      showPrompt(`Log in or sign up to chat with @${user.username}`);
    }
  };

  // Bottom-left video call button. Stops propagation so the surrounding
  // <Link>'s navigation doesn't fire — tapping the button opens the
  // package picker, tapping anywhere else on the card still goes to
  // the profile.
  const isSelf = me && String(me._id) === String(user.id);
  const callDisabled = status === 'busy' || isSelf;

  const onCallClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!me) {
      showPrompt(`Log in or sign up to call @${user.username}`);
      return;
    }
    if (callDisabled) return;
    setPickerOpen(true);
  };

  // Modal callback — replicates Profile.jsx's startWithPackage so the
  // navigation pattern stays consistent with the existing call flow.
  const onStart = (packageId, callType) => {
    const params = new URLSearchParams({
      type: callType || 'video',
      peer: user.username,
    });
    if (packageId) params.set('package', packageId);
    nav(`/call/${user.id}?${params.toString()}`);
  };

  return (
    <>
    <Link
      to={`/u/${user.username}`}
      onClick={onClick}
      className="group relative block aspect-[3/4] rounded-2xl overflow-hidden bg-neutral-200 shadow-sm hover:shadow-lg transition"
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-5xl font-medium text-white bg-tinder">
          {(user.displayName || user.username || '?').charAt(0).toUpperCase()}
        </div>
      )}

      {/* Bottom fade for legibility */}
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

      {/* Top-right: single tri-state status pill. LIVE / BUSY /
          OFFLINE — colour and label both flip from the live presence
          store, so this is the only indicator on the card. */}
      {status === 'busy' ? (
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide text-white bg-red-500 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          BUSY
        </span>
      ) : status === 'online' ? (
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide text-white bg-rose-600 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
      ) : (
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide text-white bg-neutral-500/90 backdrop-blur-sm shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
          OFFLINE
        </span>
      )}

      {/* Bottom-right corner: video call button anchored flush to the
          card's corner (no inset). Tapping opens the package picker;
          the surrounding card click still navigates to the profile
          (we stop propagation in onCallClick). Disabled state when
          the creator is busy or this is your own card; hidden
          entirely on your own card. */}
      {!isSelf && (
        <button
          type="button"
          onClick={onCallClick}
          disabled={callDisabled}
          aria-label={
            status === 'busy'
              ? `${user.displayName || user.username} is in a call`
              : `Start video call with ${user.displayName || user.username}`
          }
          title={
            status === 'busy'
              ? 'Currently in a call'
              : `Video call ${user.displayName || user.username}`
          }
          className={`absolute bottom-0 right-0 w-10 h-10 grid place-items-center shadow-md transition rounded-tl-2xl rounded-br-2xl ${
            callDisabled
              ? 'bg-neutral-400/85 text-white/80 cursor-not-allowed'
              : 'bg-tinder text-white hover:brightness-110 active:translate-y-[1px]'
          }`}
        >
          <Video size={17} strokeWidth={2.2} />
        </button>
      )}

      {/* Bottom: name + handle. Shifted left of the corner button when
          it's present so the text doesn't sit underneath it. */}
      <div
        className={`absolute bottom-2.5 left-2.5 ${isSelf ? 'right-2.5' : 'right-12'} text-white`}
      >
        <p className="text-sm font-semibold truncate drop-shadow">
          {user.displayName || user.username}
        </p>
        <p className="text-[11px] opacity-80 truncate">@{user.username}</p>
      </div>
    </Link>

    {/* Package picker rendered as a sibling of the Link — being
        outside the <a> means clicks inside the modal never bubble up
        to trigger profile navigation. */}
    <PackagePickerModal
      peer={{ username: user.username }}
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      onStart={onStart}
      callTypeFilter="video"
    />
    </>
  );
}
