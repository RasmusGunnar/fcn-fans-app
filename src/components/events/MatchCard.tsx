// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { FeedCardShell } from '../feed/FeedCardShell';
import { useAuth } from '../../auth/AuthProvider';
import { defaultTheme } from '../../theme';

interface MatchCardProps {
  matchId: string; // Required for comments
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoffAt: string;
  venue: string | null;
  venueCity: string | null;
  competition: string | null;
  round: string | null;
  liked?: boolean;
  likes?: number;
  comments?: number;
  onPress: () => void;
  onToggleLike?: () => void;
  onPressShare?: () => void;
}

export function MatchCard({
  matchId,
  home,
  away,
  homeLogo,
  awayLogo,
  kickoffAt,
  venue,
  venueCity,
  competition,
  round,
  liked = false,
  likes = 0,
  comments = 0,
  onPress,
  onToggleLike = () => {},
  onPressShare = () => {},
}: MatchCardProps) {
  const { user, isAppAdmin } = useAuth();

  const date = new Date(kickoffAt);
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
      targetType="match"
      targetId={matchId}
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
        <Text style={styles.badge}>KAMP</Text>
        {competition && <Text style={styles.competition}>{competition}</Text>}
      </View>

      <View style={styles.matchRow}>
        <View style={styles.team}>
          {homeLogo ? (
            <Image source={{ uri: homeLogo }} style={styles.teamLogo} />
          ) : (
            <View style={styles.teamCircle}>
              <Text style={styles.teamInitials}>{home.substring(0, 3).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {home}
          </Text>
        </View>

        <Text style={styles.vs}>VS</Text>

        <View style={styles.team}>
          {awayLogo ? (
            <Image source={{ uri: awayLogo }} style={styles.teamLogo} />
          ) : (
            <View style={styles.teamCircle}>
              <Text style={styles.teamInitials}>{away.substring(0, 3).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={2}>
            {away}
          </Text>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={styles.icon}>📅</Text>
          <Text style={styles.detailText}>
            {dateStr}, kl. {timeStr}
          </Text>
        </View>
        {venue && (
          <View style={styles.detailRow}>
            <Text style={styles.icon}>🏟️</Text>
            <Text style={styles.detailText}>
              {venue}
              {venueCity ? `, ${venueCity}` : ''}
            </Text>
          </View>
        )}
        {round && (
          <View style={styles.detailRow}>
            <Text style={styles.icon}>🏆</Text>
            <Text style={styles.detailText}>{round}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={onPress}>
        <Text style={styles.buttonText}>Se detaljer</Text>
      </TouchableOpacity>
    </FeedCardShell>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  badge: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.bg.card,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.sm,
    fontSize: 11,
    fontWeight: '700',
  },
  competition: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    fontWeight: '600',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[6],
  },
  team: {
    alignItems: 'center',
    flex: 1,
  },
  teamLogo: {
    width: 50,
    height: 50,
    borderRadius: theme.radius.pill,
  },
  teamCircle: {
    width: 50,
    height: 50,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitials: {
    color: theme.colors.bg.card,
    fontSize: 14,
    fontWeight: '700',
  },
  teamName: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginTop: theme.spacing[1],
    textAlign: 'center',
  },
  vs: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginHorizontal: theme.spacing[4],
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
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.sm,
    alignItems: 'center',
  },
  buttonText: {
    color: theme.colors.bg.card,
    fontSize: 14,
    fontWeight: '700',
  },
});
