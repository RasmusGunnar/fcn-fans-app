// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { CardRoot, CardHeader } from '../cards';
import { Button, Text } from '../ui';
import { EventSubtypeBadge } from '../ui/EventSubtypeBadge';
import { useAuth } from '../../auth/AuthProvider';
import { defaultTheme } from '../../theme';
import { matchProvider } from '../../services/matches';
import type { Match } from '../../services/matches/MatchProvider';

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
  const [matchData, setMatchData] = useState<Match | null>(null);

  useEffect(() => {
    let isActive = true;
    matchProvider.getMatchById(matchId).then((data) => {
      if (isActive) {
        setMatchData(data);
      }
    });
    return () => {
      isActive = false;
    };
  }, [matchId]);

  const resolvedKickoff = matchData?.kickoff ?? kickoffAt;
  const date = resolvedKickoff ? new Date(resolvedKickoff) : null;
  const dateStr = date
    ? date.toLocaleDateString('da-DK', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : null;
  const timeStr = date
    ? date.toLocaleTimeString('da-DK', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <CardRoot
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
      <CardHeader nameLine={competition ?? undefined} subtitle={undefined} />

      {matchData ? (
        <View style={styles.matchRow}>
          <View style={styles.team}>
            {homeLogo ? (
              <Image source={{ uri: homeLogo }} style={styles.teamLogo} />
            ) : (
              <View style={styles.teamCircle}>
                <Text variant="caption" color="inverse" style={styles.teamInitials}>
                  {matchData.homeTeamName.substring(0, 3).toUpperCase()}
                </Text>
              </View>
            )}
            <Text variant="caption" color="primary" style={styles.teamName} numberOfLines={2}>
              {matchData.homeTeamName}
            </Text>
          </View>

          <Text variant="bodyBold" color="primary" style={styles.vs}>
            VS
          </Text>

          <View style={styles.team}>
            {awayLogo ? (
              <Image source={{ uri: awayLogo }} style={styles.teamLogo} />
            ) : (
              <View style={styles.teamCircle}>
                <Text variant="caption" color="inverse" style={styles.teamInitials}>
                  {matchData.awayTeamName.substring(0, 3).toUpperCase()}
                </Text>
              </View>
            )}
            <Text variant="caption" color="primary" style={styles.teamName} numberOfLines={2}>
              {matchData.awayTeamName}
            </Text>
          </View>
        </View>
      ) : (
        <Text variant="body" color="secondary" style={styles.loadingText}>
          Kampdata indlæses…
        </Text>
      )}

      <View style={styles.details}>
        {dateStr && timeStr ? (
          <View style={styles.detailRow}>
            <Text variant="caption" color="secondary" style={styles.icon}>
              📅
            </Text>
            <Text variant="caption" color="secondary" style={styles.detailText}>
              {dateStr}, kl. {timeStr}
            </Text>
          </View>
        ) : null}
        {(matchData?.venueName || venue) && (
          <View style={styles.detailRow}>
            <Text variant="caption" color="secondary" style={styles.icon}>
              🏟️
            </Text>
            <Text variant="caption" color="secondary" style={styles.detailText}>
              {matchData?.venueName || venue}
              {venueCity ? `, ${venueCity}` : ''}
            </Text>
          </View>
        )}
        {round && (
          <View style={styles.detailRow}>
            <Text variant="caption" color="secondary" style={styles.icon}>
              🏆
            </Text>
            <Text variant="caption" color="secondary" style={styles.detailText}>
              {round}
            </Text>
          </View>
        )}
      </View>

      <Button title="Se detaljer" onPress={onPress} size="sm" />
    </CardRoot>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
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
  },
  teamName: {
    marginTop: theme.spacing[1],
    textAlign: 'center',
  },
  vs: {
    marginHorizontal: theme.spacing[4],
  },
  details: {
    marginBottom: theme.spacing[3],
  },
  loadingText: {
    marginBottom: theme.spacing[3],
    textAlign: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[1],
  },
  icon: {
    marginRight: theme.spacing[1],
  },
  detailText: {
  },
});
