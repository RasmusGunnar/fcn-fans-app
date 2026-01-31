// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { PrimaryButton } from '../PrimaryButton';
import { CardActions } from './CardActions';
import { defaultTheme } from '../../theme';

interface CommunityCardProps {
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

export function CommunityCard({
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
}: CommunityCardProps) {
  const theme = defaultTheme;
  
  return (
    <Card style={styles.card}>
      <Pill
        label="Community"
        variant="blue"
        icon={<Ionicons name="people" size={14} color={theme.colors.bg.card} />}
      />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="people-circle" size={40} color={theme.colors.primary} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="people" size={12} color={theme.colors.text.secondary} />
            <Text style={styles.metaText}>{members} medlemmer</Text>
            <Text style={styles.metaSeparator}>•</Text>
            <Ionicons name="time" size={12} color={theme.colors.text.secondary} />
            <Text style={styles.metaText}>{timeAgo}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>
      <PrimaryButton title="Gå til fællesskab" variant="blue" onPress={onPressJoin} />
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
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginLeft: theme.spacing[1],
  },
  metaSeparator: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginHorizontal: theme.spacing[1],
  },
  description: {
    fontSize: 14,
    color: theme.colors.text.primary,
    lineHeight: 20,
    marginBottom: theme.spacing[6],
  },
});
