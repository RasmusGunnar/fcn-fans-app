import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { InstagramCard } from '../components/shared/InstagramCard';
import { DirectMessageReportModal } from '../components/messages/DirectMessageReportModal';
import { GroupAvatar } from '../components/messages/GroupAvatar';
import { MessageImage } from '../components/messages/MessageImage';
import { MessageScreenHeader } from '../components/messages/MessageScreenHeader';
import { TypingIndicator } from '../components/messages/TypingIndicator';
import { Text } from '../components/ui';
import { useConversationTyping } from '../hooks/useConversationTyping';
import { removeMessageImage, uploadMessageImage } from '../lib/messageMedia';
import { pickCameraPhoto, pickImageFromLibrary, type PickedMedia } from '../lib/mediaPicker';
import { supabase } from '../lib/supabase';
import { extractInstagramShare, removeStandaloneInstagramUrl } from '../lib/instagram';
import {
  blockDirectMessageUser,
  createDirectMessageClientId,
  getConversationDetails,
  getConversationMessages,
  markConversationRead,
  reportConversation,
  sendMessage,
  unblockDirectMessageUser,
} from '../services/messagesApi';
import { useMessageUnread } from '../state/MessageUnreadContext';
import { useTheme, type Theme } from '../theme';
import type {
  ConversationDetails,
  ConversationMessage,
  DirectMessageReportReason,
  MessageCursor,
  MessageMediaUpload,
  MessagePeer,
} from '../types/messages';
import type { SharedLinkAttachment } from '../types/externalShare';
import {
  canSubmitDirectMessage,
  formatDirectMessageTimestamp,
  formatMessageDateSeparator,
  getConversationTitle,
  isLatestOwnDirectMessageSeen,
  mergeDirectMessages,
} from '../utils/directMessages';

type ConversationRoute = {
  params?: {
    conversationId?: string;
    peer?: MessagePeer;
    externalShare?: SharedLinkAttachment;
  };
};

type PendingSend = {
  body: string;
  clientMessageId: string;
  selectedImageUri: string | null;
  externalShareCanonicalUrl: string | null;
  media: MessageMediaUpload | null;
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
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [composer, setComposer] = useState('');
  const [selectedImage, setSelectedImage] = useState<PickedMedia | null>(null);
  const [externalShare, setExternalShare] = useState<SharedLinkAttachment | null>(
    route.params?.externalShare ?? null,
  );
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const requestIdRef = useRef(0);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const detailsRef = useRef<ConversationDetails | null>(null);
  const pendingSendRef = useRef<PendingSend | null>(null);
  const hasOlderRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const readMessageIdRef = useRef<string | null>(null);
  const accessFallbackRef = useRef(false);

  messagesRef.current = messages;
  detailsRef.current = details;
  pendingSendRef.current = pendingSend;
  hasOlderRef.current = hasOlder;
  loadingOlderRef.current = loadingOlder;

  const currentDisplayName =
    String(user?.user_metadata?.display_name ?? user?.user_metadata?.username ?? '').trim() ||
    'En fan';
  const { typingLabel, notifyComposerChanged, stopTyping } = useConversationTyping({
    conversationId,
    userId: user?.id,
    displayName: currentDisplayName,
    enabled: Boolean(isFocused && details),
  });

  const returnToInbox = useCallback(
    (showMessage = false) => {
      if (accessFallbackRef.current) return;
      accessFallbackRef.current = true;
      if (showMessage) {
        Alert.alert('Samtalen er ikke tilgængelig', 'Du har ikke længere adgang til samtalen.');
      }
      navigation.replace('MessagesList');
    },
    [navigation],
  );

  const loadConversation = useCallback(
    async (mode: 'initial' | 'refresh' | 'older' = 'initial') => {
      if (!conversationId) return returnToInbox();
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
            : getConversationDetails(conversationId),
          getConversationMessages(conversationId, cursor),
        ]);
        if (requestIdRef.current !== requestId) return;
        if (!nextDetails) return returnToInbox(mode !== 'initial');
        setDetails(nextDetails);
        setMessages((current) =>
          mode === 'older' ? mergeDirectMessages(current, page) : mergeDirectMessages([], page),
        );
        hasOlderRef.current = page.length === 30;
        setHasOlder(page.length === 30);
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : 'Samtalen kunne ikke hentes.';
        if (mode === 'initial' || message.includes('ikke længere tilgængelig')) {
          returnToInbox(mode !== 'initial');
        } else {
          setLoadError(message);
        }
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

  useEffect(() => void loadConversation('initial'), [loadConversation]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadConversation('refresh'), 100);
    };
    const channel = supabase
      .channel(`conversation-v2-${conversationId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_members',
          filter: `conversation_id=eq.${conversationId}`,
        },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') scheduleRefresh();
      });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, loadConversation, user?.id]);

  useEffect(() => {
    let currentState: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground =
        nextState === 'active' && (currentState === 'background' || currentState === 'inactive');
      if (nextState !== 'active') stopTyping();
      currentState = nextState;
      if (returnedToForeground && isFocused) void loadConversation('refresh');
    });
    return () => subscription.remove();
  }, [isFocused, loadConversation, stopTyping]);

  useEffect(() => {
    const latestLoadedMessage = messages[0];
    if (!isFocused || !conversationId || !latestLoadedMessage) return;
    if (readMessageIdRef.current === latestLoadedMessage.id) return;
    const timer = setTimeout(() => {
      void markConversationRead(conversationId, latestLoadedMessage.id)
        .then(() => {
          readMessageIdRef.current = latestLoadedMessage.id;
          void refreshUnreadCount();
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [conversationId, isFocused, messages, refreshUnreadCount]);

  useEffect(
    () => () => {
      const orphanPath = pendingSendRef.current?.media?.path;
      if (orphanPath) void removeMessageImage(orphanPath);
    },
    [],
  );

  const clearPending = useCallback((removeUpload: boolean) => {
    const orphanPath = pendingSendRef.current?.media?.path;
    if (removeUpload && orphanPath) void removeMessageImage(orphanPath);
    setPendingSend(null);
    setSendError(null);
  }, []);

  const selectImage = useCallback(
    (source: 'camera' | 'library') => {
      const picker = source === 'camera' ? pickCameraPhoto : pickImageFromLibrary;
      void picker().then((asset) => {
        if (!asset) return;
        clearPending(true);
        setExternalShare(null);
        setSelectedImage(asset);
      });
    },
    [clearPending],
  );

  const openImagePicker = useCallback(() => {
    Alert.alert('Tilføj billede', undefined, [
      { text: 'Tag billede', onPress: () => selectImage('camera') },
      { text: 'Vælg fra bibliotek', onPress: () => selectImage('library') },
      { text: 'Annuller', style: 'cancel' },
    ]);
  }, [selectImage]);

  const submitMessage = useCallback(async () => {
    if (!conversationId || !user?.id || sending || details?.blocked) return;
    const normalizedBody = composer.trim();
    const imageUri = selectedImage?.uri ?? null;
    const externalShareCanonicalUrl = externalShare?.canonicalUrl ?? null;
    let attempt = pendingSend;
    if (
      !attempt ||
      attempt.body !== normalizedBody ||
      attempt.selectedImageUri !== imageUri ||
      attempt.externalShareCanonicalUrl !== externalShareCanonicalUrl
    ) {
      if (attempt?.media?.path) void removeMessageImage(attempt.media.path);
      attempt = {
        body: normalizedBody,
        clientMessageId: createDirectMessageClientId(),
        selectedImageUri: imageUri,
        externalShareCanonicalUrl,
        media: null,
      };
      setPendingSend(attempt);
    }
    if (!attempt.body && !selectedImage && !externalShare) return;

    setSending(true);
    setSendError(null);
    stopTyping();
    try {
      let media = attempt.media;
      if (selectedImage && !media) {
        media = await uploadMessageImage(conversationId, user.id, selectedImage);
        attempt = { ...attempt, media };
        setPendingSend(attempt);
      }
      const result = await sendMessage({
        conversationId,
        body: attempt.body,
        clientMessageId: attempt.clientMessageId,
        media,
        externalShare,
      });
      setMessages((current) => mergeDirectMessages(current, [result.message]));
      setComposer('');
      setSelectedImage(null);
      setExternalShare(null);
      setPendingSend(null);
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : 'Beskeden kunne ikke sendes. Prøv igen.',
      );
    } finally {
      setSending(false);
    }
  }, [
    composer,
    conversationId,
    details?.blocked,
    externalShare,
    pendingSend,
    selectedImage,
    sending,
    stopTyping,
    user?.id,
  ]);

  const confirmBlock = useCallback(() => {
    if (!details?.peer || details.type !== 'direct') return;
    Alert.alert(
      details.blockedByMe ? 'Fjern blokering' : 'Blokér bruger',
      details.blockedByMe
        ? `Vil du tillade beskeder med ${details.peer.displayName} igen?`
        : `Vil du blokere ${details.peer.displayName}? I kan stadig være i samme gruppe.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: details.blockedByMe ? 'Fjern blokering' : 'Blokér',
          style: details.blockedByMe ? 'default' : 'destructive',
          onPress: () => {
            const action = details.blockedByMe
              ? unblockDirectMessageUser(details.peer!.id)
              : blockDirectMessageUser(details.peer!.id);
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
    if (details.type === 'group') {
      Alert.alert(getConversationTitle(details), undefined, [
        { text: 'Gruppeinfo', onPress: () => navigation.navigate('GroupInfo', { conversationId }) },
        { text: 'Rapportér gruppe', onPress: () => setReportVisible(true) },
        { text: 'Annuller', style: 'cancel' },
      ]);
      return;
    }
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
    Alert.alert(getConversationTitle(details), undefined, actions);
  }, [confirmBlock, conversationId, details, navigation]);

  const submitReport = useCallback(
    async (reason: DirectMessageReportReason, note: string) => {
      if (!details || reportSubmitting) return;
      setReportSubmitting(true);
      try {
        await reportConversation({
          conversationId: details.id,
          targetType: details.type === 'group' ? 'conversation' : 'user',
          reportedUserId: details.peer?.id,
          reason,
          note,
        });
        setReportVisible(false);
        Alert.alert('Tak', 'Din rapport er sendt.');
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

  const title = details ? getConversationTitle(details) : (routePeer?.displayName ?? 'Samtale');
  const canSend = Boolean(
    details &&
    canSubmitDirectMessage({
      body: composer,
      hasImage: Boolean(selectedImage),
      hasExternalShare: Boolean(externalShare),
      blocked: details.blocked,
      sending,
    }),
  );
  const latestOwnMessageId = messages.find((message) => message.senderId === user?.id)?.id ?? null;

  const renderMessage = useCallback(
    ({ item, index }: { item: ConversationMessage; index: number }) => {
      const own = item.senderId === user?.id;
      const olderMessage = messages[index + 1];
      const showDate =
        !olderMessage ||
        formatMessageDateSeparator(olderMessage.createdAt) !==
          formatMessageDateSeparator(item.createdAt);
      const seen =
        details?.type === 'direct' &&
        own &&
        isLatestOwnDirectMessageSeen({
          message: item,
          latestOwnMessageId,
          peerLastReadAt: details.peerLastReadAt,
          peerLastReadMessageId: details.peerLastReadMessageId,
        });
      return (
        <View>
          {showDate ? (
            <View style={styles.dateSeparator}>
              <Text variant="small" color="muted">
                {formatMessageDateSeparator(item.createdAt)}
              </Text>
            </View>
          ) : null}
          <View style={[styles.messageRow, own ? styles.ownRow : styles.peerRow]}>
            {!own && details?.type === 'group' ? (
              <Avatar
                userId={item.senderId}
                avatarUrl={item.senderAvatarUrl}
                label={item.senderDisplayName}
                size={theme.spacing[7]}
              />
            ) : null}
            <View style={[styles.bubble, own ? styles.ownBubble : styles.peerBubble]}>
              {!own && details?.type === 'group' ? (
                <Text variant="small" color="secondary">
                  {item.senderDisplayName}
                </Text>
              ) : null}
              {item.mediaPath ? (
                <MessageImage
                  uri={item.mediaUrl}
                  width={item.mediaWidth}
                  height={item.mediaHeight}
                  onPress={() => {
                    if (!item.mediaUrl) return;
                    navigation.getParent()?.navigate('MediaViewer', {
                      items: [{ uri: item.mediaUrl, url: item.mediaUrl, type: 'image' }],
                      initialIndex: 0,
                    });
                  }}
                />
              ) : null}
              {item.externalShare ? (
                <InstagramCard attachment={item.externalShare} compact />
              ) : null}
              {item.body ? (
                <Text variant="body" style={own ? styles.ownBubbleText : undefined}>
                  {item.body}
                </Text>
              ) : null}
              <View style={styles.messageMeta}>
                <Text variant="small" style={own ? styles.ownMessageTime : styles.peerMessageTime}>
                  {formatDirectMessageTimestamp(item.createdAt)}
                </Text>
                {own && item.id === latestOwnMessageId && details?.type === 'direct' ? (
                  <Text variant="small" style={styles.ownMessageTime}>
                    {seen ? 'Set' : 'Sendt'}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      );
    },
    [details, latestOwnMessageId, messages, navigation, styles, theme.spacing, user?.id],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? theme.spacing[2] : 0}
    >
      <MessageScreenHeader
        title={title}
        subtitle={details?.type === 'group' ? `${details.memberCount} medlemmer` : typingLabel}
        peer={details?.type === 'direct' ? (details.peer ?? routePeer) : null}
        leading={
          details?.type === 'group' ? (
            <GroupAvatar name={title} avatarUrl={details.avatarUrl} size={theme.spacing[8]} />
          ) : undefined
        }
        onTitlePress={
          details?.type === 'group'
            ? () => navigation.navigate('GroupInfo', { conversationId })
            : details?.peer
              ? () => navigation.navigate('PublicProfile', { userId: details.peer!.id })
              : undefined
        }
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
                Skriv den første besked i {title}.
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
      {details?.type === 'group' ? <TypingIndicator label={typingLabel} /> : null}
      {details?.blocked ? (
        <View style={styles.blockedComposer}>
          <Ionicons name="ban-outline" size={20} color={theme.colors.text.secondary} />
          <Text variant="body" color="secondary" style={styles.blockedText}>
            Du kan ikke sende beskeder i denne samtale.
          </Text>
        </View>
      ) : (
        <>
          {selectedImage ? (
            <View style={styles.imagePreviewRow}>
              <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
              <Pressable
                style={styles.removeImageButton}
                onPress={() => {
                  clearPending(true);
                  setSelectedImage(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Fjern valgt billede"
              >
                <Ionicons name="close" size={20} color={theme.colors.text.inverse} />
              </Pressable>
            </View>
          ) : null}
          {externalShare ? (
            <View style={styles.externalSharePreview}>
              <InstagramCard
                attachment={externalShare}
                compact
                onRemove={() => {
                  clearPending(true);
                  setExternalShare(null);
                }}
              />
            </View>
          ) : null}
          <View style={styles.composerWrap}>
            <Pressable
              style={styles.mediaButton}
              onPress={openImagePicker}
              disabled={sending || !details}
              accessibilityRole="button"
              accessibilityLabel="Tilføj billede"
            >
              <Ionicons name="image-outline" size={23} color={theme.colors.primary} />
            </Pressable>
            <TextInput
              style={styles.composerInput}
              value={composer}
              onChangeText={(value) => {
                const detectedShare = extractInstagramShare(value);
                const nextComposer = removeStandaloneInstagramUrl(value, detectedShare);
                if (detectedShare) {
                  setExternalShare(detectedShare);
                  setSelectedImage(null);
                }
                setComposer(nextComposer);
                notifyComposerChanged(nextComposer);
                if (pendingSend && nextComposer.trim() !== pendingSend.body) clearPending(true);
              }}
              placeholder={
                selectedImage || externalShare ? 'Tilføj en tekst (valgfrit)' : 'Skriv en besked'
              }
              placeholderTextColor={theme.colors.text.muted}
              multiline
              maxLength={2000}
              editable={!sending && Boolean(details)}
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
        </>
      )}
      {sendError && pendingSend ? (
        <Pressable
          style={styles.retryBand}
          onPress={() => void submitMessage()}
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
    dateSeparator: { alignItems: 'center', paddingVertical: theme.spacing[3] },
    messageRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing[2],
    },
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
    messageMeta: { alignSelf: 'flex-end', flexDirection: 'row', gap: theme.spacing[2] },
    ownMessageTime: { color: theme.colors.text.inverse, opacity: 0.8 },
    peerMessageTime: { color: theme.colors.text.muted },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    centeredText: { textAlign: 'center' },
    errorBand: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.pill.red.bg,
    },
    imagePreviewRow: {
      minHeight: theme.spacing[16] + theme.spacing[4],
      paddingHorizontal: theme.layout.screenPadding,
      paddingTop: theme.spacing[2],
      alignItems: 'flex-start',
      backgroundColor: theme.colors.bg.card,
    },
    imagePreview: { width: 96, height: 96, borderRadius: theme.radius.md },
    externalSharePreview: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingTop: theme.spacing[2],
      backgroundColor: theme.colors.bg.card,
    },
    removeImageButton: {
      position: 'absolute',
      top: theme.spacing[1],
      left: theme.layout.screenPadding + 78,
      width: theme.spacing[7],
      height: theme.spacing[7],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.overlay.heavy,
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
    mediaButton: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      alignItems: 'center',
      justifyContent: 'center',
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
