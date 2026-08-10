import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import type { StadiumReaction } from '../../types/stadiumLive';
import { getStadiumReactionCopy } from '../../utils/stadiumLive';
import { Avatar } from '../Avatar';
import { Text } from '../ui';

type Props = {
  reaction: StadiumReaction;
  busy?: boolean;
  onOpen: () => void;
  onReply: () => void;
  onMessage: () => void;
  onDismiss: () => void;
};

export function StadiumReactionToast({
  reaction,
  busy,
  onOpen,
  onReply,
  onMessage,
  onDismiss,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.position, { top: insets.top + theme.spacing[2] }]}
    >
      <View style={styles.toast}>
        <Pressable onPress={onOpen} style={styles.main} accessibilityRole="button">
          <Avatar
            userId={reaction.actorId}
            avatarUrl={reaction.actorAvatarUrl}
            label={reaction.actorDisplayName || reaction.actorUsername || 'Fan'}
            size={theme.spacing[10]}
          />
          <View style={styles.copy}>
            <Text variant="small" color="secondary">
              STADION LIVE
            </Text>
            <Text variant="bodyBold" numberOfLines={2}>
              {getStadiumReactionCopy(reaction)}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="Luk stadionreaktion"
          onPress={onDismiss}
          style={styles.close}
        >
          <Ionicons name="close" size={20} color={theme.colors.text.secondary} />
        </Pressable>
        <View style={styles.actions}>
          <Pressable disabled={busy} onPress={onReply} style={styles.action}>
            <Text variant="small" style={styles.actionText}>
              🙌 Tilbage
            </Text>
          </Pressable>
          <Pressable disabled={busy} onPress={onMessage} style={styles.action}>
            <Ionicons name="chatbubble-outline" size={14} color={theme.colors.primary} />
            <Text variant="small" style={styles.actionText}>
              Skriv
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    position: {
      position: 'absolute',
      left: theme.spacing[3],
      right: theme.spacing[3],
      zIndex: 1000,
    },
    toast: {
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.primary,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.card,
      padding: theme.spacing[3],
      ...(Platform.OS === 'ios'
        ? theme.elevation.lg.ios
        : { elevation: theme.elevation.lg.android }),
    },
    main: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      paddingRight: theme.spacing[7],
    },
    copy: { flex: 1, minWidth: 0, gap: theme.spacing[1] },
    close: {
      position: 'absolute',
      right: theme.spacing[2],
      top: theme.spacing[2],
      padding: theme.spacing[1],
    },
    actions: { flexDirection: 'row', gap: theme.spacing[2], marginTop: theme.spacing[3] },
    action: {
      minHeight: theme.spacing[9],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
    },
    actionText: { color: theme.colors.primary, fontWeight: '700' },
  });
