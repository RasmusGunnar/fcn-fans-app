import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MatchAttendancePanel } from '../match/MatchAttendancePanel';
import { MatchHero } from '../match/MatchHero';
import { Text } from '../ui';
import { useMatchdayState } from '../../state/MatchdayStateContext';
import { useTheme } from '../../theme';
import { cleanText } from '../../utils/text';
import { type MatchdayStatusPanelAction } from '../match/MatchdayStatusPanel';
import type { MatchViewState } from '../../utils/matchdayState';
import { matchExperience } from '../../utils/fanExperience';

interface NextMatchBadgeProps {
  match: {
    id: string;
    coverUrl: string | null;
    homeTeam: string;
    awayTeam: string;
    homeLogo: string | null;
    awayLogo: string | null;
    kickoff: string;
    statusCode?: string | null;
    venue: string | null;
    venueCity: string | null;
    title: string;
    subtitle: string;
  };
  matchStatusPanel?: {
    viewState: MatchViewState;
    isGoing: boolean;
    avatars: string[];
    count: number;
    titleOverride?: string;
    bodyOverride?: string;
    socialCopyOverride?: {
      countLabel?: string | null;
      text: string;
    };
    primaryLabel?: string;
    primaryDisabled?: boolean;
    secondaryActions?: MatchdayStatusPanelAction[];
  };
  countdownLabel?: string;
  onPressPrimaryAction?: () => void;
  onPressSocial?: () => void;
  onPress: () => void;
}

const NextMatchBadge: React.FC<NextMatchBadgeProps> = ({
  match,
  matchStatusPanel,
  countdownLabel,
  onPress,
}) => {
  const state = useMatchdayState(match?.id);
  const theme = useTheme();
  if (!match) return null;
  const venue = [cleanText(match.venue), cleanText(match.venueCity)].filter(Boolean).join(' · ');
  const experience = matchExperience(match.statusCode, match.kickoff);
  return (
    <View style={[styles.wrapper, { backgroundColor: theme.colors.bg.card }]}>
      <View style={styles.kickerRow}>
        <View style={styles.kickerMark} />
        <Text style={styles.kicker}>MATCH CENTER</Text>
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Se kampdetaljer: ${cleanText(match.homeTeam)} mod ${cleanText(match.awayTeam)}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
      >
        <MatchHero
          imageUrl={match.coverUrl}
          homeTeam={cleanText(match.homeTeam)}
          awayTeam={cleanText(match.awayTeam)}
          homeLogo={match.homeLogo}
          awayLogo={match.awayLogo}
          badge={
            experience.state === 'POST_MATCH'
              ? 'Kampen er slut'
              : experience.state === 'LIVE'
                ? 'Kamp i gang'
                : 'Næste kamp'
          }
          date={cleanText(match.subtitle)}
          venue={venue}
          status={
            experience.state === 'PRE_MATCH'
              ? cleanText(countdownLabel).replace(/^Afspark om/i, 'Kickoff om')
              : experience.label
          }
        />
      </Pressable>
      {matchStatusPanel ? (
        <MatchAttendancePanel
          embedded
          state={state}
          planningAllowed={experience.planningAllowed}
          setRsvp={state.setRsvpStatus}
          checkIn={state.checkIn}
          checkOut={state.checkOut}
        />
      ) : null}
    </View>
  );
};

export default NextMatchBadge;

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EBDCDF',
    overflow: 'hidden',
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8EFF1',
  },
  kickerMark: { width: 3, height: 10, borderRadius: 2, backgroundColor: '#8D1831' },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: '#701B2E' },
});
