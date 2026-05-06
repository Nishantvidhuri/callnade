import { useEffect } from 'react';
import { api } from '../services/api.js';
import { useAuthStore } from '../stores/auth.store.js';
import { useNotificationStore } from '../stores/notification.store.js';
import { getSocket } from '../services/socket.js';

export function useNotifications() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);

  // Initial fetch on auth
  useEffect(() => {
    if (!accessToken || !me) {
      useNotificationStore.getState().clear();
      return;
    }
    api
      .get('/follow/requests/incoming')
      .then((r) => {
        const items = (r.data.items || []).map((req) => ({
          id: `req-${req._id}`,
          type: 'follow_request',
          from: {
            id: req.from?._id,
            username: req.from?.username,
            displayName: req.from?.displayName,
            avatarUrl: null,
          },
          requestId: req._id,
          createdAt: req.createdAt,
        }));
        useNotificationStore.getState().setItems(items);
      })
      .catch(() => {});
  }, [accessToken, me]);

  // Real-time
  useEffect(() => {
    if (!accessToken || !me) return;
    const socket = getSocket();
    const onNew = (notif) => useNotificationStore.getState().prepend(notif);
    const onRemove = ({ id }) => useNotificationStore.getState().remove(id);
    socket.on('notification:new', onNew);
    socket.on('notification:remove', onRemove);
    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:remove', onRemove);
    };
  }, [accessToken, me]);
}
