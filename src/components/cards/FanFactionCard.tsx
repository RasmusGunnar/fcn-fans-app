import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { PrimaryButton } from '../PrimaryButton';
import { CardActions } from './CardActions';
import { colors, spacing } from '../../theme';

interface FanFactionCardProps {
  name: string;
  members: number;
  timeAgo: string;
  description: string;
  liked: boolean;
  likes: number;
  comments: number;
  onToggleLike: () => void;
  onPressComment: () => void;
  onPressShare: () => void;
  onPressJoin: () => void;
}

export function FanFactionCard({
  name,
  members,
  timeAgo,
  description,
  liked,
  likes,
  comments,
  onToggleLike,
  onPressComment,
  onPressShare,
  onPressJoin,
}: FanFactionCardProps) {
  return (
    <Card style={styles.card}>
      <Pill label="Fanfraktion" variant="neutral" icon={<Ionicons name="star" size={14} color={colors.neutralPillText} />} />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="star" size={40} color={colors.fcnRed} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="people" size={12} color={colors.subtext} />
            <Text style={styles.metaText}>{members} medlemmer</Text>
            <Text style={styles.metaSeparator}>•</Text>
            <Ionicons name="time" size={12} color={colors.subtext} />
            <Text style={styles.metaText}>{timeAgo}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>
      <PrimaryButton title="Se fraktion" variant="blue" onPress={onPressJoin} />
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
    marginRight: spacing.sm,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: colors.subtext,
    marginLeft: spacing.xs,
  },
  metaSeparator: {
    fontSize: 12,
    color: colors.subtext,
    marginHorizontal: spacing.xs,
  },
  description: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
});