import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { PrimaryButton } from '../PrimaryButton';
import { FeedCardShell } from '../feed/FeedCardShell';
import { useAuth } from '../../auth/AuthProvider';
import { colors, spacing } from '../../theme';

interface EventCardProps {
  eventId: string; // Required for comments
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
  eventId,
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
  const { user, isAppAdmin } = useAuth();
  
  return (
    <FeedCardShell
      targetType="event"
      targetId={eventId}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      actions={{
        liked,
        likes,
        comments,
        onToggleLike,
        onPressShare,
      }}
    >
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
    </FeedCardShell>
  );
}

const styles = StyleSheet.create({
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
