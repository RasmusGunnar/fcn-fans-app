// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
        <Pressable style={styles.action} onPress={handleToggleLike} pointerEvents="auto">
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={20}
            color={liked ? theme.colors.primary : theme.colors.text.secondary}
          />
          <Text style={[styles.actionText, liked && styles.likedText]}>{likes}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={handlePressComment} pointerEvents="auto">
          <Ionicons name="chatbubble-outline" size={20} color={theme.colors.text.secondary} />
          <Text style={styles.actionText}>{comments}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.action} onPress={onPressShare} pointerEvents="auto">
        <Ionicons name="share-social-outline" size={20} color={theme.colors.text.secondary} />
      </Pressable>
    </View>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
  },
  leftActions: {
    flexDirection: 'row',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing[4],
  },
  actionText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginLeft: theme.spacing[1],
  },
  likedText: {
    color: theme.colors.primary,
  },
});
