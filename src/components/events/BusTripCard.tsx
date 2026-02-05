// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../ui/Card';
import { EventSubtypeBadge } from '../ui/EventSubtypeBadge';
import { defaultTheme } from '../../theme';

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
          <EventSubtypeBadge subtype="bus_trip" />
          {organizerName && <Text style={styles.organizer}>🚩 {organizerName}</Text>}
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

const theme = defaultTheme;

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.layout.listGap,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
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
    marginBottom: theme.spacing[3],
  },
  details: {
    marginBottom: theme.spacing[3],
  },
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
  footer: {
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.default,
  },
  seatsText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  fullText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.secondary,
  },
});
