import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { getDirectMessageUnreadCount } from '../services/messagesApi';
import { clearAppIconBadge, syncAppIconBadge } from '../services/notificationsApi';

type MessageUnreadContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<number>;
};

const MessageUnreadContext = createContext<MessageUnreadContextValue | undefined>(undefined);

export function MessageUnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadCountRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(user?.id ?? null);
  activeUserIdRef.current = user?.id ?? null;

  const publishUnreadCount = useCallback((count: number) => {
    const normalized = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    unreadCountRef.current = normalized;
    setUnreadCount(normalized);
  }, []);

  const refreshUnreadCount = useCallback(async (): Promise<number> => {
    const requestedUserId = user?.id ?? null;
    if (!requestedUserId) {
      publishUnreadCount(0);
      return 0;
    }

    const count = await getDirectMessageUnreadCount();
    if (activeUserIdRef.current === requestedUserId) {
      publishUnreadCount(count);
      void syncAppIconBadge(requestedUserId, {
        shouldApply: () => activeUserIdRef.current === requestedUserId,
      });
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
      .channel(`message-unread-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => {
        void refreshUnreadCount();
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshUnreadCount();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void refreshUnreadCount();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshUnreadCount, user?.id]);

  useEffect(() => {
    let appState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returningToForeground =
        nextState === 'active' && (appState === 'background' || appState === 'inactive');
      appState = nextState;
      if (returningToForeground) {
        void refreshUnreadCount();
      }
    });

    return () => subscription.remove();
  }, [refreshUnreadCount]);

  const value = useMemo(
    () => ({ unreadCount, refreshUnreadCount }),
    [refreshUnreadCount, unreadCount],
  );

  return <MessageUnreadContext.Provider value={value}>{children}</MessageUnreadContext.Provider>;
}

export function useMessageUnread(): MessageUnreadContextValue {
  const context = useContext(MessageUnreadContext);
  if (!context) {
    throw new Error('useMessageUnread must be used within MessageUnreadProvider');
  }
  return context;
}
