// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { defaultTheme } from '../../theme';
import { Text } from '../ui';

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
  const iconCountGap = theme.spacing[2];
  const iconSize = theme.spacing[5];

  const handleToggleLike = () => {
    onToggleLike();
  };

  const handlePressComment = () => {
    onPressComment();
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.leftActions} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [
            styles.action,
            { gap: iconCountGap },
            pressed && styles.actionPressed,
          ]}
          onPress={handleToggleLike}
          pointerEvents="auto"
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={iconSize}
            color={liked ? theme.colors.primary : theme.colors.text.muted}
            style={liked ? styles.likeIconActive : undefined}
          />
          <Text variant="caption" color={liked ? 'primary' : 'muted'} style={styles.countText}>
            {likes}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.action,
            { gap: iconCountGap },
            pressed && styles.actionPressed,
          ]}
          onPress={handlePressComment}
          pointerEvents="auto"
        >
          <Ionicons name="chatbubble-outline" size={iconSize} color={theme.colors.text.muted} />
          <Text variant="caption" color="muted" style={styles.countText}>
            {comments}
          </Text>
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.action,
          styles.shareAction,
          pressed && styles.actionPressed,
        ]}
        onPress={onPressShare}
        pointerEvents="auto"
      >
        <Ionicons name="share-social-outline" size={iconSize} color={theme.colors.text.muted} />
      </Pressable>
    </View>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.layout.cardPadding,
    paddingVertical: theme.spacing[3],
    borderTopWidth: theme.layout.borderHairline,
    borderTopColor: theme.colors.border.subtle,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.layout.cardPadding,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.spacing[11],
    paddingVertical: theme.spacing[2],
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
