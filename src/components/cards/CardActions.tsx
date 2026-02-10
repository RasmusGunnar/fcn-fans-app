// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../ui';
import { defaultTheme } from '../../theme';

interface CardActionsProps {
  liked: boolean;
  likes: number;
  comments: number;
  onToggleLike: () => void;
  onPressComment: () => void;
  onPressShare: () => void;
}

export function CardActions({
  liked,
  likes,
  comments,
  onToggleLike,
  onPressComment,
  onPressShare,
}: CardActionsProps) {
  const theme = defaultTheme;
  // No 6px (1.5) spacing token available; use closest token.
  const iconCountGap = theme.spacing[2];

  const handleToggleLike = () => {
    if (__DEV__) {
      console.log('[CardActions] Like toggle clicked:', {
        before: { liked, likes },
        willToggle: !liked,
      });
    }
    onToggleLike();
  };

  const handlePressComment = () => {
    if (__DEV__) {
      console.log('[CardActions] Comment button clicked, handler type:', typeof onPressComment);
    }
    onPressComment();
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.leftActions} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.action, { gap: iconCountGap }, pressed && styles.actionPressed]}
          onPress={handleToggleLike}
          pointerEvents="auto"
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={20}
            color={liked ? theme.colors.primary : theme.colors.text.muted}
            style={liked ? styles.likeIconActive : undefined}
          />
          <Text
            variant="caption"
            color={liked ? 'primary' : 'muted'}
            style={styles.countText}
          >
            {likes}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.action, { gap: iconCountGap }, pressed && styles.actionPressed]}
          onPress={handlePressComment}
          pointerEvents="auto"
        >
          <Ionicons name="chatbubble-outline" size={20} color={theme.colors.text.muted} />
          <Text variant="caption" color="muted" style={styles.countText}>
            {comments}
          </Text>
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.action, styles.shareAction, pressed && styles.actionPressed]}
        onPress={onPressShare}
        pointerEvents="auto"
      >
        <Ionicons name="share-social-outline" size={20} color={theme.colors.text.muted} />
      </Pressable>
    </View>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderTopWidth: theme.layout.borderHairline,
    borderTopColor: theme.colors.border.default,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shareAction: {
    marginLeft: 'auto',
  },
  actionPressed: {
    opacity: 0.7,
  },
  likeIconActive: {
    transform: [{ scale: 1.1 }],
  },
  countText: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight as any,
  },
});
