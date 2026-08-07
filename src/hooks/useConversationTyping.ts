import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getTypingLabel, updateTypingUsers, type TypingUser } from '../utils/directMessages';

const TYPING_IDLE_MS = 2500;
const TYPING_THROTTLE_MS = 1000;

export function useConversationTyping(params: {
  conversationId: string;
  userId: string | null | undefined;
  displayName: string;
  enabled: boolean;
}) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentAtRef = useRef(0);
  const typingRef = useRef(false);

  const sendTyping = useCallback(
    (typing: boolean) => {
      const channel = channelRef.current;
      if (!channel || !params.userId || !params.enabled) return;
      typingRef.current = typing;
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: params.userId,
          displayName: params.displayName,
          typing,
        },
      });
    },
    [params.displayName, params.enabled, params.userId],
  );

  const stopTyping = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    if (typingRef.current) sendTyping(false);
  }, [sendTyping]);

  const notifyComposerChanged = useCallback(
    (value: string) => {
      if (!value.trim()) {
        stopTyping();
        return;
      }
      const now = Date.now();
      if (!typingRef.current || now - lastSentAtRef.current >= TYPING_THROTTLE_MS) {
        lastSentAtRef.current = now;
        sendTyping(true);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    [sendTyping, stopTyping],
  );

  useEffect(() => {
    if (!params.enabled || !params.conversationId || !params.userId) {
      setTypingUsers([]);
      return;
    }

    const channel = supabase.channel(`conversation:${params.conversationId}:typing`, {
      config: { private: true },
    });
    channelRef.current = channel;
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const userId = typeof payload?.userId === 'string' ? payload.userId : '';
        const displayName =
          typeof payload?.displayName === 'string' && payload.displayName.trim()
            ? payload.displayName.trim()
            : 'En fan';
        if (!userId || typeof payload?.typing !== 'boolean') return;
        setTypingUsers((current) =>
          updateTypingUsers(
            current,
            { userId, displayName, typing: payload.typing },
            params.userId as string,
            Date.now(),
          ),
        );
      })
      .subscribe();

    const pruneTimer = setInterval(() => {
      const now = Date.now();
      setTypingUsers((current) => current.filter((item) => item.expiresAt > now));
    }, 1000);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
      if (typingRef.current) {
        void channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            userId: params.userId,
            displayName: params.displayName,
            typing: false,
          },
        });
      }
      typingRef.current = false;
      channelRef.current = null;
      clearInterval(pruneTimer);
      setTypingUsers([]);
      void supabase.removeChannel(channel);
    };
  }, [params.conversationId, params.displayName, params.enabled, params.userId]);

  return useMemo(
    () => ({ typingLabel: getTypingLabel(typingUsers), notifyComposerChanged, stopTyping }),
    [notifyComposerChanged, stopTyping, typingUsers],
  );
}
