import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { PrimaryButton } from '../PrimaryButton';
import { CardActions } from './CardActions';
import { colors, spacing } from '../../theme';

interface NewsCardProps {
  headline: string;
  snippet: string;
  source: string;
  timeAgo: string;
  liked: boolean;
  likes: number;
  comments: number;
  onToggleLike: () => void;
  onPressComment: () => void;
  onPressShare: () => void;
  onPressRead: () => void;
}

export function NewsCard({
  headline,
  snippet,
  source,
  timeAgo,
  liked,
  likes,
  comments,
  onToggleLike,
  onPressComment,
  onPressShare,
  onPressRead,
}: NewsCardProps) {
  return (
    <Card style={styles.card}>
      <Pill label="Nyheder" variant="neutral" />
      <View style={styles.imagePlaceholder}>
        <Text style={styles.placeholderText}>Nyhedsbillede</Text>
      </View>
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.snippet}>{snippet}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.source}>{source}</Text>
        <Text style={styles.timeAgo}>{timeAgo}</Text>
      </View>
      <PrimaryButton title="Læs artikel" variant="outline" onPress={onPressRead} />
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
  imagePlaceholder: {
    height: 120,
    backgroundColor: colors.border,
    borderRadius: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  placeholderText: {
    color: colors.subtext,
    fontSize: 14,
  },
  headline: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  snippet: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  source: {
    fontSize: 12,
    color: colors.subtext,
    fontWeight: '600',
  },
  timeAgo: {
    fontSize: 12,
    color: colors.subtext,
  },
});