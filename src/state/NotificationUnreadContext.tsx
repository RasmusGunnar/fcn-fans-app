import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import { clearAppIconBadge, syncAppIconBadge } from '../services/notificationsApi';
import { supabase } from '../lib/supabase';

type NotificationUnreadContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<number>;
};

const NotificationUnreadContext = createContext<NotificationUnreadContextValue | undefined>(
  undefined,
);

export function NotificationUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadCountRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(user?.id ?? null);
  activeUserIdRef.current = user?.id ?? null;

  const publishUnreadCount = useCallback((count: number) => {
    unreadCountRef.current = count;
    setUnreadCount(count);
  }, []);

  const refreshUnreadCount = useCallback(async (): Promise<number> => {
    const requestedUserId = user?.id ?? null;
    if (!requestedUserId) {
      publishUnreadCount(0);
      return 0;
    }

    const count = await syncAppIconBadge(requestedUserId);
    if (count !== null && activeUserIdRef.current === requestedUserId) {
      publishUnreadCount(count);
      return count;
    }

    return activeUserIdRef.current === requestedUserId ? unreadCountRef.current : 0;
  }, [publishUnreadCount, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      publishUnreadCount(0);
      void clearAppIconBadge();
      return;
    }

    void refreshUnreadCount();
  }, [publishUnreadCount, refreshUnreadCount, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notification-unread-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshUnreadCount();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshUnreadCount, user?.id]);

  const value = useMemo(
    () => ({ unreadCount, refreshUnreadCount }),
    [refreshUnreadCount, unreadCount],
  );

  return (
    <NotificationUnreadContext.Provider value={value}>
      {children}
    </NotificationUnreadContext.Provider>
  );
}

export function useNotificationUnread(): NotificationUnreadContextValue {
  const context = useContext(NotificationUnreadContext);
  if (!context) {
    throw new Error('useNotificationUnread must be used within NotificationUnreadProvider');
  }
  return context;
}
