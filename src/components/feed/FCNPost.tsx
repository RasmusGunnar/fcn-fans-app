import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../../theme';
import { Card, Text, Avatar } from '../ui';
import { CardActions } from '../cards/CardActions';

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
        <CardActions
          liked={liked}
          likes={likes}
          comments={comments}
          onToggleLike={onPressLike ?? (() => {})}
          onPressComment={onPressComment ?? (() => {})}
          onPressShare={onPressShare ?? (() => {})}
        />
      </Pressable>
    </Card>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[3],
      gap: theme.spacing[3],
    },
    headerText: {
      flex: 1,
      gap: theme.spacing[0],
    },
    content: {
      paddingBottom: theme.spacing[3],
    },
  });
}
