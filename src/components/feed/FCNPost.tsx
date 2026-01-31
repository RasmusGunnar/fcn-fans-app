import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../../theme';
import { Card, Text, Avatar } from '../ui';

export interface FCNPostProps {
  authorName: string;
  authorAvatar?: string;
  timeAgo: string;
  content: string;
  likes: number;
  comments: number;
  shares: number;
  liked?: boolean;
  onPressLike?: () => void;
  onPressComment?: () => void;
  onPressShare?: () => void;
  onPressPost?: () => void;
}

/**
 * FCNPost - Strict design system component
 * NO hardcoded colors, spacing, radius, or shadows
 * Uses theme tokens exclusively
 */
export function FCNPost({
  authorName,
  authorAvatar,
  timeAgo,
  content,
  likes,
  comments,
  shares,
  liked = false,
  onPressLike,
  onPressComment,
  onPressShare,
  onPressPost,
}: FCNPostProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <Card variant="feedItem">
      <Pressable onPress={onPressPost} disabled={!onPressPost}>
        {/* Header: Avatar + Author + Time */}
        <View style={styles.header}>
          <Avatar size="sm" avatarUrl={authorAvatar} label={authorName} />
          <View style={styles.headerText}>
            <Text variant="bodyBold">{authorName}</Text>
            <Text variant="caption" color="secondary">
              {timeAgo}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text variant="body">{content}</Text>
        </View>

        {/* Action Bar */}
        <View style={styles.actionBar}>
          <Pressable
            style={styles.actionButton}
            onPress={onPressLike}
            disabled={!onPressLike}
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={theme.components.icon.size.md}
              color={liked ? theme.colors.state.error : theme.colors.text.secondary}
            />
            <Text variant="caption" color="secondary" style={styles.actionText}>
              {likes}
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={onPressComment}
            disabled={!onPressComment}
          >
            <Ionicons
              name="chatbubble-outline"
              size={theme.components.icon.size.md}
              color={theme.colors.text.secondary}
            />
            <Text variant="caption" color="secondary" style={styles.actionText}>
              {comments}
            </Text>
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={onPressShare}
            disabled={!onPressShare}
          >
            <Ionicons
              name="share-outline"
              size={theme.components.icon.size.md}
              color={theme.colors.text.secondary}
            />
            <Text variant="caption" color="secondary" style={styles.actionText}>
              {shares}
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Card>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing[4],
      gap: theme.spacing[3],
    },
    headerText: {
      flex: 1,
      gap: theme.spacing[0],
    },
    content: {
      paddingHorizontal: theme.spacing[4],
      paddingBottom: theme.spacing[3],
    },
    actionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[2],
      borderTopWidth: theme.layout.borderWidth,
      borderTopColor: theme.colors.border.light,
      gap: theme.spacing[6],
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    actionText: {
      marginLeft: theme.spacing[1],
    },
  });
}
