import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/ui';
import { getNotifications, markAsRead, type NotificationItem } from '../services/notificationsApi';
import { useTheme, type Theme } from '../theme';
import { navigateFromNotificationData } from '../navigation/navigationRef';

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

function getNotificationLabel(item: NotificationItem): string {
  if (item.type === 'mention') {
    return item.entity_type === 'comment'
      ? 'Du blev nævnt i en kommentar'
      : 'Du blev nævnt i et opslag';
  }

  return 'Nogen svarede på din kommentar';
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await getNotifications(user.id);
      setItems((data as NotificationItem[] | null) ?? []);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handlePress = useCallback(async (item: NotificationItem) => {
    if (!item.read) {
      const marked = await markAsRead(item.id);
      if (marked) {
        setItems((current) =>
          current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
        );
      }
    }

    const didNavigate = navigateFromNotificationData({
      type: 'post',
      postId: item.post_id,
    });

    if (!didNavigate) {
      Alert.alert('Fejl', 'Kunne ikke åbne opslaget.');
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => (
      <Pressable
        style={[styles.row, item.read ? styles.rowRead : styles.rowUnread]}
        onPress={() => void handlePress(item)}
      >
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
            {item.type === 'reply'
              ? 'Tryk for at åbne opslaget med svaret'
              : 'Tryk for at åbne opslaget'}
          </Text>
        </View>
        {!item.read ? <View style={styles.unreadDot} /> : null}
      </Pressable>
    ),
    [handlePress, styles],
  );

  return (
    <View style={styles.container}>
      <AppHeader title="Notifikationer" subtitle="Mentions og svar" showProfileButton={false} />

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
      paddingHorizontal: theme.layout.screenPadding,
      paddingVertical: theme.spacing[3],
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      alignSelf: 'flex-start',
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
      gap: theme.spacing[1],
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
