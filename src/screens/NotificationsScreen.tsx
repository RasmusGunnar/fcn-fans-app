import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/ui';
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
  type NotificationItem,
} from '../services/notificationsApi';
import { useNotificationUnread } from '../state/NotificationUnreadContext';
import { useTheme, type Theme } from '../theme';
import { navigateFromNotificationData } from '../navigation/navigationRef';
import {
  getNotificationInteractionKind,
  getNotificationLabel,
} from '../utils/notificationPresentation';

function formatRelativeTime(value: string): string {
  const createdAt = new Date(value).getTime();
  if (!Number.isFinite(createdAt)) {
    return '';
  }

  const diffMs = Math.max(0, Date.now() - createdAt);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Lige nu';
  if (diffMins < 60) return `${diffMins} min siden`;
  if (diffHours < 24) return `${diffHours} t siden`;
  if (diffDays < 7) return `${diffDays} d siden`;

  try {
    return new Intl.DateTimeFormat('da-DK', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function getNotificationIcon(type: NotificationItem['type']): keyof typeof Ionicons.glyphMap {
  if (type === 'mention') return 'at';
  if (type === 'reply') return 'chatbubble-outline';
  if (type === 'match_highfive') return 'hand-left-outline';
  if (type === 'stadium_reaction') return 'radio-outline';
  if (type === 'media_digest') return 'newspaper-outline';
  if (type === 'match_checkin_reminder') return 'football-outline';
  if (type === 'event_reminder') return 'calendar-outline';
  if (type === 'community_post' || type === 'community_poll') return 'people-outline';
  if (type === 'hot_post') return 'flame-outline';
  return 'checkmark-circle-outline';
}

function buildNotificationTarget(item: NotificationItem): Record<string, unknown> {
  if (item.data && Object.keys(item.data).length > 0) {
    return item.data;
  }

  if (item.type === 'mention' && item.entity_type === 'comment') {
    return {
      notificationType: 'mention_comment',
      targetType: 'post_comment',
      postId: item.post_id,
      commentId: item.entity_id,
      entityId: item.entity_id,
      entityType: item.entity_type,
    };
  }

  if (item.type === 'mention') {
    return {
      notificationType: 'mention_post',
      targetType: 'post',
      postId: item.post_id,
      entityId: item.entity_id,
      entityType: item.entity_type,
    };
  }

  if (item.type !== 'reply') {
    return { targetType: 'home_feed' };
  }

  const isCommentOnPost = getNotificationInteractionKind(item) === 'comment_on_post';

  return {
    notificationType: isCommentOnPost ? 'comment_on_post' : 'reply_to_comment',
    targetType: isCommentOnPost ? 'post_comment' : 'comment_reply',
    postId: item.post_id,
    commentId: item.entity_id,
    entityId: item.entity_id,
    entityType: item.entity_type,
  };
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { unreadCount, refreshUnreadCount } = useNotificationUnread();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (options?: { refresh?: boolean }) => {
      if (!user?.id) {
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (options?.refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const { data } = await getNotifications(user.id);
        setItems((data as NotificationItem[] | null) ?? []);
        await refreshUnreadCount();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [refreshUnreadCount, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handlePress = useCallback(
    async (item: NotificationItem) => {
      if (!item.read) {
        const marked = await markAsRead(item.id);
        if (marked) {
          setItems((current) =>
            current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
          );
          await refreshUnreadCount();
        }
      }

      const didNavigate = navigateFromNotificationData(buildNotificationTarget(item));

      if (!didNavigate) {
        Alert.alert('Fejl', 'Kunne ikke åbne notifikationen.');
      }
    },
    [refreshUnreadCount],
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!user?.id || unreadCount === 0) return;

    const marked = await markAllAsRead(user.id);
    if (!marked) {
      Alert.alert('Fejl', 'Kunne ikke markere notifikationerne som læst.');
      return;
    }

    setItems((current) => current.map((item) => ({ ...item, read: true })));
    await refreshUnreadCount();
  }, [refreshUnreadCount, unreadCount, user?.id]);

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => (
      <Pressable
        style={[styles.row, item.read ? styles.rowRead : styles.rowUnread]}
        onPress={() => void handlePress(item)}
      >
        <View style={styles.rowIcon}>
          <Ionicons
            name={getNotificationIcon(item.type)}
            size={theme.components.icon.size.sm}
            color={theme.colors.primary}
          />
        </View>
        <View style={styles.rowCopy}>
          <View style={styles.rowHeader}>
            <Text variant="body" color="primary" style={styles.rowTitle}>
              {getNotificationLabel(item)}
            </Text>
            <Text variant="caption" color="secondary">
              {formatRelativeTime(item.created_at)}
            </Text>
          </View>
          <Text variant="small" color="secondary">
            {item.body ??
              (item.type === 'reply'
                ? 'Tryk for at åbne opslaget med svaret'
                : 'Tryk for at åbne notifikationen')}
          </Text>
        </View>
        {!item.read ? <View style={styles.unreadDot} /> : null}
      </Pressable>
    ),
    [handlePress, styles, theme.components.icon.size.sm, theme.colors.primary],
  );

  return (
    <View style={styles.container}>
      <AppHeader
        title="Notifikationer"
        subtitle="Din aktivitet i FCN Fans"
        showProfileButton={false}
      />

      <View style={styles.toolbar}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons
            name="chevron-back"
            size={theme.components.icon.size.md}
            color={theme.colors.text.primary}
          />
          <Text variant="body" color="primary">
            Tilbage
          </Text>
        </Pressable>
        {unreadCount > 0 ? (
          <Pressable style={styles.markAllButton} onPress={() => void handleMarkAllAsRead()}>
            <Ionicons
              name="checkmark-done"
              size={theme.components.icon.size.sm}
              color={theme.colors.primary}
            />
            <Text variant="small" color="primary">
              Markér alle som læst
            </Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load({ refresh: true })}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            items.length === 0 ? styles.listContentEmpty : null,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text variant="h3" color="primary" style={styles.emptyTitle}>
                Du har ingen notifikationer endnu
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[3],
      gap: theme.spacing[3],
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      alignSelf: 'flex-start',
    },
    markAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      minHeight: theme.spacing[9],
    },
    loadingState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContent: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingBottom: theme.spacing[6],
      gap: theme.spacing[3],
    },
    listContentEmpty: {
      flexGrow: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing[2],
      borderRadius: theme.radius.lg,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[3],
    },
    rowRead: {
      backgroundColor: theme.colors.bg.card,
    },
    rowUnread: {
      backgroundColor: theme.colors.bg.surface,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: theme.spacing[1],
    },
    rowIcon: {
      width: theme.spacing[9],
      height: theme.spacing[9],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: theme.spacing[2],
    },
    rowTitle: {
      flex: 1,
    },
    unreadDot: {
      position: 'absolute',
      top: theme.spacing[2],
      right: theme.spacing[2],
      width: theme.spacing[2],
      height: theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[6],
      paddingVertical: theme.spacing[10],
    },
    emptyTitle: {
      textAlign: 'center',
    },
  });
}
