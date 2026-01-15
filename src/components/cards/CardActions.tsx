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

export function CardActions({ liked, likes, comments, onToggleLike, onPressComment, onPressShare }: CardActionsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.leftActions}>
        <Pressable style={styles.action} onPress={onToggleLike}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.fcnRed : colors.subtext} />
          <Text style={[styles.actionText, liked && styles.likedText]}>{likes}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={onPressComment}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.subtext} />
          <Text style={styles.actionText}>{comments}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.action} onPress={onPressShare}>
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