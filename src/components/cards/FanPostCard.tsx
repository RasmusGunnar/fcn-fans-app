import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { CardActions } from './CardActions';
import { colors, spacing } from '../../theme';

interface FanPostCardProps {
  name: string;
  group?: string;
  timeAgo: string;
  text: string;
  liked: boolean;
  likes: number;
  comments: number;
  onToggleLike: () => void;
  onPressComment: () => void;
  onPressShare: () => void;
}

export function FanPostCard({
  name,
  group,
  timeAgo,
  text,
  liked,
  likes,
  comments,
  onToggleLike,
  onPressComment,
  onPressShare,
}: FanPostCardProps) {
  return (
    <Card style={styles.card}>
      <Pill label="Fra Fans" />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{name}</Text>
          {group && <Text style={styles.group}>{group}</Text>}
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
      </View>
      <Text style={styles.text}>{text}</Text>
      <View style={styles.imagePlaceholder}>
        <Text style={styles.placeholderText}>Billede placeholder</Text>
      </View>
      <CardActions
        liked={liked}
        likes={likes}
        comments={comments}
        onToggleLike={onToggleLike}
        onPressComment={onPressComment}
        onPressShare={onPressShare}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  group: {
    fontSize: 12,
    color: colors.subtext,
  },
  timeAgo: {
    fontSize: 12,
    color: colors.subtext,
  },
  text: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  imagePlaceholder: {
    height: 120,
    backgroundColor: colors.border,
    borderRadius: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  placeholderText: {
    color: colors.subtext,
    fontSize: 14,
  },
});