// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FeedCardShell } from '../feed/FeedCardShell';
import { useAuth } from '../../auth/AuthProvider';
import { defaultTheme } from '../../theme';

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

const theme = defaultTheme;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  badge: {
    backgroundColor: theme.colors.state.success,
    color: theme.colors.bg.card,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.sm,
    fontSize: 11,
    fontWeight: '700',
  },
  organizer: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  description: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[3],
    lineHeight: 18,
  },
  details: {},
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[1],
  },
  icon: {
    fontSize: 14,
    marginRight: theme.spacing[1],
  },
  detailText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
});
