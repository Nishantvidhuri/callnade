import { View } from 'react-native';
import { theme } from '../theme.js';

/**
 * Three-state status dot. Mirrors the web's PresenceDot so the same
 * payload (user.presence === 'online' | 'busy' | 'offline') drives
 * both surfaces. Hidden by default when offline.
 */
export default function PresenceDot({ status = 'offline', size = 12, showOffline = false }) {
  if (!showOffline && status === 'offline') return null;
  const bg = COLOURS[status] || COLOURS.offline;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        borderWidth: 2,
        borderColor: '#ffffff',
      }}
    />
  );
}

const COLOURS = {
  online: theme.colors.success,
  busy: theme.colors.danger,
  offline: theme.colors.mutedSoft,
};
