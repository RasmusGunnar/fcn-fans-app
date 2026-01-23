import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

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
  const handleToggleLike = () => {
    if (__DEV__) {
      console.log('[CardActions] Like toggle clicked:', { before: { liked, likes }, willToggle: !liked });
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
            color={liked ? colors.fcnRed : colors.subtext}
          />
          <Text style={[styles.actionText, liked && styles.likedText]}>{likes}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={handlePressComment} pointerEvents="auto">
          <Ionicons name="chatbubble-outline" size={20} color={colors.subtext} />
          <Text style={styles.actionText}>{comments}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.action} onPress={onPressShare} pointerEvents="auto">
        <Ionicons name="share-social-outline" size={20} color={colors.subtext} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.actionRowBorder,
  },
  leftActions: {
    flexDirection: 'row',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  actionText: {
    fontSize: 14,
    color: colors.subtext,
    marginLeft: spacing.xs,
  },
  likedText: {
    color: colors.fcnRed,
  },
});
