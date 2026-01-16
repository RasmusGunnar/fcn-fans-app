import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { colors, spacing } from '../../theme';

interface EventCardProps {
  title: string;
  startAt: string;
  location: string | null;
  organizerName: string | null;
  description: string | null;
  onPress: () => void;
}

export function EventCard({
  title,
  startAt,
  location,
  organizerName,
  description,
  onPress,
}: EventCardProps) {
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
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.badge}>EVENT</Text>
          {organizerName && (
            <Text style={styles.organizer}>🚩 {organizerName}</Text>
          )}
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
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
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
