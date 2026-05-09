import { usePresenceStore } from '../stores/presence.store.js';

/**
 * Status dot for a creator's avatar. Reads live status from the
 * presence store, falling back to whatever was baked into the API
 * payload — that way the dot is correct on first paint and then
 * updates in real time when the socket pushes a `presence:update`.
 *
 * Props:
 *   userId   — the user whose status we're showing.
 *   fallback — initial value from the API (`user.presence`). Used
 *              before any socket event arrives. Defaults to 'offline'.
 *   size     — dot diameter in px. Default 11 (small enough for
 *              avatar corners, large enough to read).
 *   ring     — outer ring colour for contrast against the avatar.
 *              Default white; pass null to drop the ring.
 *   showOffline — render even when offline (default false: hidden so
 *              the corner stays clean for inactive creators).
 *   title    — optional accessible label override.
 */
export default function PresenceDot({
  userId,
  fallback = 'offline',
  size = 11,
  ring = '#ffffff',
  showOffline = false,
  title,
  className = '',
}) {
  // Selector that returns the latest status for this single user.
  // Re-renders only when this user's value flips.
  const status = usePresenceStore((s) =>
    s.byId[String(userId)] ?? fallback,
  );

  if (!showOffline && status === 'offline') return null;

  const palette = COLOURS[status] || COLOURS.offline;
  const label = title || LABEL[status] || 'Offline';

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={`inline-block rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: palette.bg,
        boxShadow: ring ? `0 0 0 2px ${ring}` : 'none',
      }}
    />
  );
}

const COLOURS = {
  online:  { bg: '#22c55e' }, // emerald-500
  busy:    { bg: '#ef4444' }, // red-500
  offline: { bg: '#9ca3af' }, // gray-400
};

const LABEL = {
  online: 'Online',
  busy: 'In a call',
  offline: 'Offline',
};
