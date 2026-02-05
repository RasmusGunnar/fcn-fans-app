// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '../ui';
import { Pill } from '../ui/Pill';
import { PrimaryButton } from '../PrimaryButton';
import { CardActions } from './CardActions';
import { defaultTheme } from '../../theme';

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
  const theme = defaultTheme;

  return (
    <Card style={styles.card}>
      <Pill
        label="Fanfraktion"
        variant="subtle"
        icon={<Ionicons name="star" size={14} color={theme.colors.pill.neutral.text} />}
      />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="star" size={40} color={theme.colors.primary} />
        </View>
        <View style={styles.headerInfo}>
          <Text variant="h3" color="primary" style={styles.title}>
            {name}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="people" size={12} color={theme.colors.text.secondary} />
            <Text variant="caption" color="secondary" style={styles.metaText}>
              {members} medlemmer
            </Text>
            <Text variant="caption" color="secondary" style={styles.metaSeparator}>
              •
            </Text>
            <Ionicons name="time" size={12} color={theme.colors.text.secondary} />
            <Text variant="caption" color="secondary" style={styles.metaText}>
              {timeAgo}
            </Text>
          </View>
        </View>
      </View>
      <Text variant="body" color="primary" style={styles.description}>
        {description}
      </Text>
      <PrimaryButton title="Se fraktion" onPress={onPressJoin} />
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

const theme = defaultTheme;

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  avatar: {
    marginRight: theme.spacing[2],
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    marginBottom: theme.spacing[1],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    marginLeft: theme.spacing[1],
  },
  metaSeparator: {
    marginHorizontal: theme.spacing[1],
  },
  description: {
    marginBottom: theme.spacing[6],
  },
});
