// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { PrimaryButton } from '../PrimaryButton';
import { FeedCardShell } from '../feed/FeedCardShell';
import { useAuth } from '../../auth/AuthProvider';
import { defaultTheme } from '../../theme';

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
  const theme = defaultTheme;
  
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
        <Ionicons name="calendar" size={16} color={theme.colors.text.secondary} />
        <Text style={styles.detailText}>{date}</Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="location" size={16} color={theme.colors.text.secondary} />
        <Text style={styles.detailText}>{location}</Text>
      </View>
      <Text style={styles.spotsLeft}>{spotsLeft} pladser tilbage</Text>
      <PrimaryButton title="Book plads" onPress={onPressBook} />
    </FeedCardShell>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginLeft: theme.spacing[2],
  },
  spotsLeft: {
    fontSize: 14,
    color: theme.colors.pill.orange.text,
    fontWeight: '600',
    marginBottom: theme.spacing[6],
  },
});
