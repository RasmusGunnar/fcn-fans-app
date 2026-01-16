import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { colors, spacing } from '../../theme';

interface BusTripCardProps {
  title: string;
  startAt: string;
  departurePlace: string;
  seatsLeft: number;
  totalSeats: number;
  priceDkk: number | null;
  organizerName: string | null;
  onPress: () => void;
}

export function BusTripCard({
  title,
  startAt,
  departurePlace,
  seatsLeft,
  totalSeats,
  priceDkk,
  organizerName,
  onPress,
}: BusTripCardProps) {
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

  const isFull = seatsLeft === 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.badge}>BUSTUR</Text>
          {organizerName && (
            <Text style={styles.organizer}>🚩 {organizerName}</Text>
          )}
        </View>

        <Text style={styles.title}>{title}</Text>

        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.icon}>📅</Text>
            <Text style={styles.detailText}>
              {dateStr}, kl. {timeStr}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.icon}>📍</Text>
            <Text style={styles.detailText}>{departurePlace}</Text>
          </View>
          {priceDkk !== null && (
            <View style={styles.detailRow}>
              <Text style={styles.icon}>💰</Text>
              <Text style={styles.detailText}>{priceDkk} kr.</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          {isFull ? (
            <Text style={styles.fullText}>FULDT BOOKET</Text>
          ) : (
            <Text style={styles.seatsText}>
              {seatsLeft} / {totalSeats} pladser tilbage
            </Text>
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
    backgroundColor: '#FF9500',
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
    marginBottom: spacing.md,
  },
  details: {
    marginBottom: spacing.md,
  },
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
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  seatsText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.fcnRed,
  },
  fullText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.subtext,
  },
});
