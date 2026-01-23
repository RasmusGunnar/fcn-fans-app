import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../ui/Card';
import { FeedCardShell } from '../feed/FeedCardShell';
import { useAuth } from '../../auth/AuthProvider';
import { colors, spacing } from '../../theme';

interface EventCardProps {
  eventId: string; // Required for comments
  title: string;
  startAt: string;
  location: string | null;
  organizerName: string | null;
  description: string | null;
  liked?: boolean;
  likes?: number;
  comments?: number;
  onPress: () => void;
  onToggleLike?: () => void;
  onPressShare?: () => void;
}

export function EventCard({
  eventId,
  title,
  startAt,
  location,
  organizerName,
  description,
  liked = false,
  likes = 0,
  comments = 0,
  onPress,
  onToggleLike = () => {},
  onPressShare = () => {},
}: EventCardProps) {
  const { user, isAppAdmin } = useAuth();
  
  const date = new Date(startAt);
  const dateStr = date.toLocaleDateString('da-DK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeStr = date.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <FeedCardShell
      targetType="event"
      targetId={eventId}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      onOpenDetail={onPress}
      actions={{
        liked,
        likes,
        comments,
        onToggleLike,
        onPressShare,
      }}
    >
      <View style={styles.header}>
        <Text style={styles.badge}>EVENT</Text>
        {organizerName && <Text style={styles.organizer}>🚩 {organizerName}</Text>}
      </View>

      <Text style={styles.title}>{title}</Text>

      {description && (
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
      )}

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.icon}>📅</Text>
          <Text style={styles.detailText}>
            {dateStr}, kl. {timeStr}
          </Text>
        </View>
        {location && (
          <View style={styles.detailRow}>
            <Text style={styles.icon}>📍</Text>
            <Text style={styles.detailText}>{location}</Text>
          </View>
        )}
      </View>
    </FeedCardShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  badge: {
    backgroundColor: '#34C759',
    color: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  organizer: {
    fontSize: 11,
    color: colors.subtext,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: 13,
    color: colors.subtext,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  details: {},
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  icon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  detailText: {
    fontSize: 13,
    color: colors.subtext,
  },
});
