import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { GroupAvatar } from '../components/messages/GroupAvatar';
import { MessageScreenHeader } from '../components/messages/MessageScreenHeader';
import { Text } from '../components/ui';
import { supabase } from '../lib/supabase';
import { getDirectMessagesInbox } from '../services/messagesApi';
import { useMessageUnread } from '../state/MessageUnreadContext';
import { useTheme, type Theme } from '../theme';
import type { ConversationSummary, InboxCursor } from '../types/messages';
import {
  formatDirectMessageTimestamp,
  formatMessageUnreadBadge,
  getConversationPreview,
  getConversationTitle,
} from '../utils/directMessages';

export default function MessagesListScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { refreshUnreadCount } = useMessageUnread();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const conversationsRef = useRef<ConversationSummary[]>([]);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);

  conversationsRef.current = conversations;
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = loadingMore;

  const loadInbox = useCallback(
    async (mode: 'initial' | 'refresh' | 'more' = 'initial') => {
      const currentConversations = conversationsRef.current;
      if (
        mode === 'more' &&
        (loadingMoreRef.current || !hasMoreRef.current || currentConversations.length === 0)
      ) {
        return;
      }

      const requestId = ++requestIdRef.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }
      setError(null);

      const lastConversation =
        mode === 'more' ? currentConversations[currentConversations.length - 1] : null;
      const cursor: InboxCursor | null = lastConversation
        ? {
            activityAt: lastConversation.activityAt,
            conversationId: lastConversation.id,
          }
        : null;

      try {
        const page = await getDirectMessagesInbox(cursor);
        if (requestIdRef.current !== requestId) return;
        setConversations((current) =>
          mode === 'more'
            ? [...current, ...page.filter((item) => !current.some((row) => row.id === item.id))]
            : page,
        );
        hasMoreRef.current = page.length === 30;
        setHasMore(page.length === 30);
        void refreshUnreadCount();
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setError(
            loadError instanceof Error ? loadError.message : 'Beskederne kunne ikke hentes.',
          );
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
          setRefreshing(false);
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [refreshUnreadCount],
  );

  useFocusEffect(
    useCallback(() => {
      void loadInbox('refresh');
    }, [loadInbox]),
  );

  useEffect(() => {
    if (!user?.id) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadInbox('refresh'), 150);
    };

    const channel = supabase
      .channel(`messages-inbox-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${user.id}`,
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
  }, [loadInbox, user?.id]);

  const renderConversation = useCallback(
    ({ item }: { item: ConversationSummary }) => {
      const unreadLabel = formatMessageUnreadBadge(item.unreadCount);
      const title = getConversationTitle(item);
      return (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() =>
            navigation.navigate('Conversation', {
              conversationId: item.id,
              peer: item.peer ?? undefined,
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Åbn ${title}`}
        >
          {item.type === 'group' ? (
            <GroupAvatar name={title} avatarUrl={item.avatarUrl} size={theme.spacing[12]} />
          ) : item.peer ? (
            <Avatar
              userId={item.peer.id}
              avatarUrl={item.peer.avatarUrl}
              label={item.peer.displayName}
              size={theme.spacing[12]}
            />
          ) : null}
          <View style={styles.rowCopy}>
            <View style={styles.rowTopLine}>
              <Text variant="bodyBold" numberOfLines={1} style={styles.peerName}>
                {title}
              </Text>
              <Text variant="small" color="muted">
                {formatDirectMessageTimestamp(item.activityAt)}
              </Text>
            </View>
            <View style={styles.rowBottomLine}>
              <Text
                variant={item.unreadCount > 0 ? 'bodyBold' : 'body'}
                color={item.unreadCount > 0 ? 'primary' : 'secondary'}
                numberOfLines={1}
                style={styles.preview}
              >
                {getConversationPreview(item, user?.id)}
              </Text>
              {unreadLabel ? (
                <View style={styles.unreadBadge}>
                  <Text variant="small" style={styles.unreadBadgeText}>
                    {unreadLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            {item.blocked ? (
              <Text variant="small" color="muted">
                Blokeret
              </Text>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [navigation, styles, theme.spacing, user?.id],
  );

  return (
    <View style={styles.container}>
      <MessageScreenHeader
        title="Beskeder"
        onBack={() => navigation.goBack()}
        rightIcon="create-outline"
        onRightPress={() => navigation.navigate('NewMessage')}
        rightAccessibilityLabel="Start ny samtale"
      />
      {loading && conversations.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadInbox('refresh')}
              tintColor={theme.colors.primary}
            />
          }
          onEndReached={() => void loadInbox('more')}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerLoader} color={theme.colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Ionicons name="chatbubbles-outline" size={36} color={theme.colors.text.muted} />
              <Text variant="h3" style={styles.emptyTitle}>
                Ingen beskeder endnu
              </Text>
              <Text variant="body" color="secondary" style={styles.emptyText}>
                Tryk på skriv-ikonet for at starte en samtale.
              </Text>
            </View>
          }
          ListHeaderComponent={
            error ? (
              <Pressable style={styles.errorBand} onPress={() => void loadInbox('refresh')}>
                <Text variant="body" color="error">
                  {error} Tryk for at prøve igen.
                </Text>
              </Pressable>
            ) : null
          }
          contentContainerStyle={conversations.length === 0 ? styles.emptyList : undefined}
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg.default },
    row: {
      minHeight: theme.spacing[16] + theme.spacing[3],
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.card,
    },
    rowPressed: { backgroundColor: theme.colors.bg.subtle },
    rowCopy: { flex: 1, minWidth: 0, gap: theme.spacing[1] },
    rowTopLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
    peerName: { flex: 1 },
    rowBottomLine: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] },
    preview: { flex: 1 },
    unreadBadge: {
      minWidth: theme.spacing[5],
      height: theme.spacing[5],
      paddingHorizontal: theme.spacing[1],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    unreadBadgeText: { color: theme.colors.text.inverse, fontWeight: '700' },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.layout.screenPadding,
      gap: theme.spacing[2],
    },
    emptyList: { flexGrow: 1 },
    emptyTitle: { textAlign: 'center' },
    emptyText: { textAlign: 'center' },
    errorBand: { padding: theme.layout.screenPadding, backgroundColor: theme.colors.pill.red.bg },
    footerLoader: { padding: theme.spacing[4] },
  });
}
