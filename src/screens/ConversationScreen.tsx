import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { DirectMessageReportModal } from '../components/messages/DirectMessageReportModal';
import { MessageScreenHeader } from '../components/messages/MessageScreenHeader';
import { Text } from '../components/ui';
import { supabase } from '../lib/supabase';
import {
  blockDirectMessageUser,
  createDirectMessageClientId,
  getDirectConversationDetails,
  getDirectMessages,
  mapDirectMessageRow,
  markDirectConversationRead,
  reportDirectMessage,
  sendDirectMessage,
  unblockDirectMessageUser,
} from '../services/messagesApi';
import { useMessageUnread } from '../state/MessageUnreadContext';
import { useTheme, type Theme } from '../theme';
import type {
  ConversationDetails,
  DirectMessage,
  DirectMessageReportReason,
  MessageCursor,
  MessagePeer,
} from '../types/messages';
import {
  canSubmitDirectMessage,
  createOrReuseDirectMessageSendAttempt,
  formatDirectMessageTimestamp,
  mergeDirectMessages,
  type DirectMessageSendAttempt,
} from '../utils/directMessages';

type ConversationRoute = {
  params?: { conversationId?: string; peer?: MessagePeer };
};

export default function ConversationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute() as ConversationRoute;
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { refreshUnreadCount } = useMessageUnread();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const conversationId = route.params?.conversationId?.trim() ?? '';
  const routePeer = route.params?.peer ?? null;
  const [details, setDetails] = useState<ConversationDetails | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [composer, setComposer] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingSend, setPendingSend] = useState<DirectMessageSendAttempt | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const requestIdRef = useRef(0);
  const messagesRef = useRef<DirectMessage[]>([]);
  const detailsRef = useRef<ConversationDetails | null>(null);
  const hasOlderRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const readMessageIdRef = useRef<string | null>(null);
  const accessFallbackRef = useRef(false);

  messagesRef.current = messages;
  detailsRef.current = details;
  hasOlderRef.current = hasOlder;
  loadingOlderRef.current = loadingOlder;

  const returnToInbox = useCallback(() => {
    if (accessFallbackRef.current) return;
    accessFallbackRef.current = true;
    navigation.replace('MessagesList');
  }, [navigation]);

  const loadConversation = useCallback(
    async (mode: 'initial' | 'refresh' | 'older' = 'initial') => {
      if (!conversationId) {
        returnToInbox();
        return;
      }
      if (mode === 'older' && (loadingOlderRef.current || !hasOlderRef.current)) return;

      const requestId = ++requestIdRef.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'older') {
        loadingOlderRef.current = true;
        setLoadingOlder(true);
      }
      setLoadError(null);

      const oldestMessage =
        mode === 'older' ? messagesRef.current[messagesRef.current.length - 1] : null;
      const cursor: MessageCursor | null = oldestMessage
        ? { createdAt: oldestMessage.createdAt, messageId: oldestMessage.id }
        : null;

      try {
        const [nextDetails, page] = await Promise.all([
          mode === 'older'
            ? Promise.resolve(detailsRef.current)
            : getDirectConversationDetails(conversationId),
          getDirectMessages(conversationId, cursor),
        ]);
        if (requestIdRef.current !== requestId) return;
        if (!nextDetails) {
          returnToInbox();
          return;
        }

        setDetails(nextDetails);
        setMessages((current) =>
          mode === 'older' ? mergeDirectMessages(current, page) : mergeDirectMessages([], page),
        );
        hasOlderRef.current = page.length === 30;
        setHasOlder(page.length === 30);
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        if (mode === 'initial') {
          returnToInbox();
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'Samtalen kunne ikke hentes.');
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
          loadingOlderRef.current = false;
          setLoadingOlder(false);
        }
      }
    },
    [conversationId, returnToInbox],
  );

  useEffect(() => {
    void loadConversation('initial');
  }, [loadConversation]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;

    const channel = supabase
      .channel(`direct-messages-${conversationId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = mapDirectMessageRow(payload.new);
          setMessages((current) => mergeDirectMessages(current, [incoming]));
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void loadConversation('refresh');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, loadConversation, user?.id]);

  useEffect(() => {
    let currentState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground =
        nextState === 'active' && (currentState === 'background' || currentState === 'inactive');
      currentState = nextState;
      if (returnedToForeground && isFocused) void loadConversation('refresh');
    });
    return () => subscription.remove();
  }, [isFocused, loadConversation]);

  useEffect(() => {
    const latestLoadedMessage = messages[0];
    if (!isFocused || !conversationId || !latestLoadedMessage) return;
    if (readMessageIdRef.current === latestLoadedMessage.id) return;

    const timer = setTimeout(() => {
      void markDirectConversationRead(conversationId, latestLoadedMessage.id)
        .then(() => {
          readMessageIdRef.current = latestLoadedMessage.id;
          void refreshUnreadCount();
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [conversationId, isFocused, messages, refreshUnreadCount]);

  const submitMessage = useCallback(
    async (retry?: DirectMessageSendAttempt) => {
      if (!conversationId || sending || details?.blocked) return;
      const attempt =
        retry ??
        createOrReuseDirectMessageSendAttempt(composer, pendingSend, createDirectMessageClientId);
      if (!attempt) return;
      setPendingSend(attempt);
      setSending(true);
      setSendError(null);

      try {
        const result = await sendDirectMessage({ conversationId, ...attempt });
        setMessages((current) => mergeDirectMessages(current, [result.message]));
        setComposer('');
        setPendingSend(null);
      } catch (error) {
        setSendError(
          error instanceof Error ? error.message : 'Beskeden kunne ikke sendes. Prøv igen.',
        );
      } finally {
        setSending(false);
      }
    },
    [composer, conversationId, details?.blocked, pendingSend, sending],
  );

  const confirmBlock = useCallback(() => {
    if (!details) return;
    Alert.alert(
      details.blockedByMe ? 'Fjern blokering' : 'Blokér bruger',
      details.blockedByMe
        ? `Vil du tillade beskeder med ${details.peer.displayName} igen?`
        : `Vil du blokere ${details.peer.displayName}? I kan stadig se jeres eksisterende beskeder.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: details.blockedByMe ? 'Fjern blokering' : 'Blokér',
          style: details.blockedByMe ? 'default' : 'destructive',
          onPress: () => {
            const action = details.blockedByMe
              ? unblockDirectMessageUser(details.peer.id)
              : blockDirectMessageUser(details.peer.id);
            void action
              .then(() => loadConversation('refresh'))
              .catch((error) =>
                Alert.alert(
                  'Kunne ikke opdatere blokering',
                  error instanceof Error ? error.message : 'Prøv igen.',
                ),
              );
          },
        },
      ],
    );
  }, [details, loadConversation]);

  const openConversationMenu = useCallback(() => {
    if (!details) return;
    const actions: Parameters<typeof Alert.alert>[2] = [];
    if (!details.blocked || details.blockedByMe) {
      actions.push({
        text: details.blockedByMe ? 'Fjern blokering' : 'Blokér bruger',
        style: details.blockedByMe ? 'default' : 'destructive',
        onPress: confirmBlock,
      });
    }
    actions.push({ text: 'Rapportér', onPress: () => setReportVisible(true) });
    actions.push({ text: 'Annuller', style: 'cancel' });
    Alert.alert(details.peer.displayName, undefined, actions);
  }, [confirmBlock, details]);

  const submitReport = useCallback(
    async (reason: DirectMessageReportReason, note: string) => {
      if (!details || reportSubmitting) return;
      setReportSubmitting(true);
      try {
        await reportDirectMessage({
          conversationId: details.id,
          reportedUserId: details.peer.id,
          reason,
          note,
        });
        setReportVisible(false);
        Alert.alert('Tak', 'Tak. Din rapport er sendt.');
      } catch (error) {
        Alert.alert(
          'Rapporten kunne ikke sendes',
          error instanceof Error ? error.message : 'Prøv igen.',
        );
      } finally {
        setReportSubmitting(false);
      }
    },
    [details, reportSubmitting],
  );

  const peer = details?.peer ?? routePeer;
  const canSend = Boolean(
    details && canSubmitDirectMessage({ body: composer, blocked: details.blocked, sending }),
  );

  const renderMessage = useCallback(
    ({ item }: { item: DirectMessage }) => {
      const own = item.senderId === user?.id;
      return (
        <View style={[styles.messageRow, own ? styles.ownRow : styles.peerRow]}>
          <View style={[styles.bubble, own ? styles.ownBubble : styles.peerBubble]}>
            <Text variant="body" style={own ? styles.ownBubbleText : undefined}>
              {item.body}
            </Text>
            <Text
              variant="small"
              style={[styles.messageTime, own ? styles.ownMessageTime : styles.peerMessageTime]}
            >
              {formatDirectMessageTimestamp(item.createdAt)}
            </Text>
          </View>
        </View>
      );
    },
    [styles, user?.id],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? theme.spacing[2] : 0}
    >
      <MessageScreenHeader
        title={peer?.displayName ?? 'Samtale'}
        peer={peer}
        onBack={() => navigation.goBack()}
        rightIcon="ellipsis-horizontal"
        onRightPress={details ? openConversationMenu : undefined}
        rightAccessibilityLabel="Samtalehandlinger"
      />
      {loading && messages.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={styles.messagesContent}
          onEndReached={() => void loadConversation('older')}
          onEndReachedThreshold={0.25}
          ListFooterComponent={
            loadingOlder ? <ActivityIndicator color={theme.colors.primary} /> : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text variant="body" color="secondary" style={styles.centeredText}>
                Skriv den første besked til {peer?.displayName ?? 'denne fan'}.
              </Text>
            </View>
          }
        />
      )}
      {loadError ? (
        <Pressable style={styles.errorBand} onPress={() => void loadConversation('refresh')}>
          <Text variant="small" color="error">
            {loadError} Tryk for at prøve igen.
          </Text>
        </Pressable>
      ) : null}
      {details?.blocked ? (
        <View style={styles.blockedComposer}>
          <Ionicons name="ban-outline" size={20} color={theme.colors.text.secondary} />
          <Text variant="body" color="secondary" style={styles.blockedText}>
            Du kan ikke sende beskeder i denne samtale.
          </Text>
        </View>
      ) : (
        <View style={styles.composerWrap}>
          <TextInput
            style={styles.composerInput}
            value={composer}
            onChangeText={(value) => {
              setComposer(value);
              if (pendingSend && value.trim() !== pendingSend.body) {
                setPendingSend(null);
                setSendError(null);
              }
            }}
            placeholder="Skriv en besked"
            placeholderTextColor={theme.colors.text.muted}
            multiline
            maxLength={2000}
            editable={!sending}
            accessibilityLabel="Skriv en besked"
          />
          <Pressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={() => void submitMessage()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send besked"
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.colors.text.inverse} />
            ) : (
              <Ionicons name="send" size={20} color={theme.colors.text.inverse} />
            )}
          </Pressable>
        </View>
      )}
      {sendError && pendingSend ? (
        <Pressable
          style={styles.retryBand}
          onPress={() => void submitMessage(pendingSend)}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Prøv at sende beskeden igen"
        >
          <Text variant="small" color="error" style={styles.retryText}>
            {sendError} Tryk for at prøve igen.
          </Text>
        </Pressable>
      ) : null}
      <DirectMessageReportModal
        visible={reportVisible}
        submitting={reportSubmitting}
        onClose={() => setReportVisible(false)}
        onSubmit={(reason, note) => void submitReport(reason, note)}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg.default },
    centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    messagesContent: {
      flexGrow: 1,
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[4],
      gap: theme.spacing[2],
    },
    messageRow: { width: '100%', flexDirection: 'row' },
    ownRow: { justifyContent: 'flex-end' },
    peerRow: { justifyContent: 'flex-start' },
    bubble: {
      maxWidth: '82%',
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      borderRadius: theme.radius.md,
      gap: theme.spacing[1],
    },
    ownBubble: { backgroundColor: theme.colors.primary },
    peerBubble: {
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
    },
    ownBubbleText: { color: theme.colors.text.inverse },
    messageTime: { alignSelf: 'flex-end' },
    ownMessageTime: { color: theme.colors.text.inverse, opacity: 0.8 },
    peerMessageTime: { color: theme.colors.text.muted },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    centeredText: { textAlign: 'center' },
    errorBand: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.pill.red.bg,
    },
    composerWrap: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[2],
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing[2],
      borderTopWidth: theme.layout.borderHairline,
      borderTopColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    composerInput: {
      flex: 1,
      minHeight: theme.spacing[10],
      maxHeight: theme.spacing[16] * 2,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[2],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.lg,
      color: theme.colors.text.primary,
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
      backgroundColor: theme.colors.bg.default,
    },
    sendButton: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    sendButtonDisabled: { opacity: 0.4 },
    blockedComposer: {
      minHeight: theme.spacing[14],
      paddingHorizontal: theme.layout.screenPadding,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[2],
      borderTopWidth: theme.layout.borderHairline,
      borderTopColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.subtle,
    },
    blockedText: { flexShrink: 1, textAlign: 'center' },
    retryBand: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.pill.red.bg,
    },
    retryText: { textAlign: 'center' },
  });
}
