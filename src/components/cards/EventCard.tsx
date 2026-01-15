import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { PrimaryButton } from '../PrimaryButton';
import { CardActions } from './CardActions';
import { colors, spacing } from '../../theme';

interface EventCardProps {
  title: string;
  date: string;
  location: string;
  spotsLeft: number;
  liked: boolean;
  likes: number;
  comments: number;
  onToggleLike: () => void;
  onPressComment: () => void;
  onPressShare: () => void;
  onPressBook: () => void;
}

export function EventCard({
  title,
  date,
  location,
  spotsLeft,
  liked,
  likes,
  comments,
  onToggleLike,
  onPressComment,
  onPressShare,
  onPressBook,
}: EventCardProps) {
  return (
    <Card style={styles.card}>
      <Pill label="Bus til Udekamp" variant="orange" />
      <Text style={styles.title}>{title}</Text>
      <View style={styles.detailRow}>
        <Ionicons name="calendar" size={16} color={colors.subtext} />
        <Text style={styles.detailText}>{date}</Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="location" size={16} color={colors.subtext} />
        <Text style={styles.detailText}>{location}</Text>
      </View>
      <Text style={styles.spotsLeft}>{spotsLeft} pladser tilbage</Text>
      <PrimaryButton title="Book plads" onPress={onPressBook} />
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  detailText: {
    fontSize: 14,
    color: colors.subtext,
    marginLeft: spacing.sm,
  },
  spotsLeft: {
    fontSize: 14,
    color: colors.orangePillText,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
});