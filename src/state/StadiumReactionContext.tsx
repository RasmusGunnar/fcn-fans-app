import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, type AppStateStatus, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { StadiumReactionToast } from '../components/stadium/StadiumReactionToast';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import {
  navigateToDirectMessageConversation,
  navigateToStadiumLive,
} from '../navigation/navigationRef';
import { createOrGetDirectConversation } from '../services/messagesApi';
import { getLatestIncomingStadiumReaction, sendStadiumReaction } from '../services/stadiumLiveApi';
import type { StadiumReaction } from '../types/stadiumLive';
import { shouldShowIncomingStadiumReaction } from '../utils/stadiumLive';

type StadiumReactionContextValue = {
  latestReaction: StadiumReaction | null;
  revision: number;
  dismissLatestReaction: () => void;
};

const StadiumReactionContext = createContext<StadiumReactionContextValue | undefined>(undefined);

export function StadiumReactionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [latestReaction, setLatestReaction] = useState<StadiumReaction | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const seenIdsRef = useRef(new Set<string>());
  const activeUserIdRef = useRef<string | null>(user?.id ?? null);
  activeUserIdRef.current = user?.id ?? null;

  const publishReaction = useCallback((reaction: StadiumReaction | null) => {
    if (!reaction || !shouldShowIncomingStadiumReaction(seenIdsRef.current, reaction.id)) return;
    seenIdsRef.current.add(reaction.id);
    if (seenIdsRef.current.size > 100) {
      const newestIds = Array.from(seenIdsRef.current).slice(-60);
      seenIdsRef.current = new Set(newestIds);
    }
    setLatestReaction(reaction);
    setRevision((current) => current + 1);
  }, []);

  const reconcileLatest = useCallback(
    async (options?: { reactionId?: string; since?: string }) => {
      const requestedUserId = user?.id ?? null;
      if (!requestedUserId) return;
      const reaction = await getLatestIncomingStadiumReaction(requestedUserId, options);
      if (activeUserIdRef.current === requestedUserId) publishReaction(reaction);
    },
    [publishReaction, user?.id],
  );

  useEffect(() => {
    seenIdsRef.current.clear();
    setLatestReaction(null);
    setRevision(0);
    if (!user?.id) return;

    const channel = supabase
      .channel(`stadium-reactions-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'social_reactions',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; context_type?: string };
          if (row.context_type !== 'stadium' || !row.id) return;
          void reconcileLatest({ reactionId: row.id });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void reconcileLatest({ since: new Date(Date.now() - 60_000).toISOString() });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reconcileLatest, user?.id]);

  useEffect(() => {
    let appState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const foregrounded =
        nextState === 'active' && (appState === 'inactive' || appState === 'background');
      appState = nextState;
      if (foregrounded) {
        void reconcileLatest({ since: new Date(Date.now() - 2 * 60_000).toISOString() });
      }
    });
    return () => subscription.remove();
  }, [reconcileLatest]);

  useEffect(() => {
    if (!latestReaction) return;
    const timeout = setTimeout(() => setLatestReaction(null), 6500);
    return () => clearTimeout(timeout);
  }, [latestReaction]);

  const handleReply = useCallback(async () => {
    if (!latestReaction || busy) return;
    setBusy(true);
    try {
      await sendStadiumReaction({
        eventId: latestReaction.eventId,
        recipientUserId: latestReaction.actorId,
        reactionType: 'high_five',
        replyToReactionId: latestReaction.id,
      });
      setLatestReaction(null);
    } catch (error) {
      Alert.alert('Kunne ikke svare', error instanceof Error ? error.message : 'Prøv igen.');
    } finally {
      setBusy(false);
    }
  }, [busy, latestReaction]);

  const handleMessage = useCallback(async () => {
    if (!latestReaction || busy) return;
    setBusy(true);
    try {
      const conversationId = await createOrGetDirectConversation(latestReaction.actorId);
      setLatestReaction(null);
      navigateToDirectMessageConversation(conversationId);
    } catch (error) {
      logger.warn('[StadiumReactionProvider] Could not open DM', error);
      Alert.alert(
        'Samtalen kunne ikke åbnes',
        error instanceof Error ? error.message : 'Prøv igen.',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, latestReaction]);

  const value = useMemo(
    () => ({
      latestReaction,
      revision,
      dismissLatestReaction: () => setLatestReaction(null),
    }),
    [latestReaction, revision],
  );

  return (
    <StadiumReactionContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {latestReaction ? (
          <StadiumReactionToast
            reaction={latestReaction}
            busy={busy}
            onOpen={() => {
              navigateToStadiumLive(latestReaction.eventId, latestReaction.id);
              setLatestReaction(null);
            }}
            onReply={() => void handleReply()}
            onMessage={() => void handleMessage()}
            onDismiss={() => setLatestReaction(null)}
          />
        ) : null}
      </View>
    </StadiumReactionContext.Provider>
  );
}

export function useStadiumReactions(): StadiumReactionContextValue {
  const context = useContext(StadiumReactionContext);
  if (!context) {
    throw new Error('useStadiumReactions must be used within StadiumReactionProvider');
  }
  return context;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
