import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, ImageBackground, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { cleanText } from '../../utils/text';
import { MatchdayStatusPanel, type MatchdayStatusPanelAction } from '../match/MatchdayStatusPanel';
import type { MatchViewState } from '../../utils/matchdayState';

interface NextMatchBadgeProps {
  match: {
    id: string;
    coverUrl: string;
    homeTeam: string;
    awayTeam: string;
    homeLogo: string | null;
    awayLogo: string | null;
    kickoff: string;
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
  onPressPrimaryAction,
  onPressSocial,
  onPress,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  if (!match) return null;

  const normalizedCountdownLabel = cleanText(countdownLabel).replace(/^Afspark om/i, 'Kickoff om');
  const cleanedHomeTeam = cleanText(match.homeTeam);
  const cleanedAwayTeam = cleanText(match.awayTeam);
  const cleanedSubtitle = cleanText(match.subtitle);
  const cleanedVenue = cleanText(match.venue);
  const cleanedVenueCity = cleanText(match.venueCity);

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onPress}
        style={styles.outerWrapper}
        android_ripple={{ color: theme.colors.overlay.light }}
      >
        <View style={styles.badgeCard}>
          <ImageBackground
            source={{ uri: match.coverUrl }}
            style={styles.heroBackground}
            imageStyle={styles.heroBackground}
          >
            <LinearGradient
              colors={[theme.colors.overlay.medium, 'transparent']}
              locations={[0, 0.35]}
              style={styles.topScrim}
            />
            <LinearGradient
              colors={['transparent', theme.colors.overlay.heavy]}
              locations={[0.3, 1]}
              style={styles.mainScrim}
            />
            <LinearGradient
              colors={['transparent', theme.colors.bg.default]}
              locations={[0, 1]}
              style={styles.bottomFade}
            />

            <View style={styles.labelChip}>
              <Text style={styles.labelText}>Næste kamp</Text>
            </View>

            <View style={styles.heroContent}>
              <View style={styles.matchupRow}>
                {match.homeLogo ? (
                  <View style={styles.teamLogoContainer}>
                    <Image source={{ uri: match.homeLogo }} style={styles.teamLogo} resizeMode="contain" />
                  </View>
                ) : (
                  <View style={[styles.teamLogoContainer, styles.teamLogoPlaceholder]}>
                    <Text style={styles.teamInitial}>{cleanedHomeTeam.charAt(0)}</Text>
                  </View>
                )}

                <Text style={styles.vsText}>VS</Text>

                {match.awayLogo ? (
                  <View style={styles.teamLogoContainer}>
                    <Image source={{ uri: match.awayLogo }} style={styles.teamLogo} resizeMode="contain" />
                  </View>
                ) : (
                  <View style={[styles.teamLogoContainer, styles.teamLogoPlaceholder]}>
                    <Text style={styles.teamInitial}>{cleanedAwayTeam.charAt(0)}</Text>
                  </View>
                )}
              </View>

              <View style={styles.metaBlock}>
                <Text style={styles.matchDate}>{cleanedSubtitle}</Text>
                {normalizedCountdownLabel ? (
                  <Text style={styles.countdownText}>{normalizedCountdownLabel}</Text>
                ) : null}
                {(cleanedVenue || cleanedVenueCity) ? (
                  <Text style={styles.venueText}>
                    {cleanedVenue && cleanedVenueCity
                      ? `${cleanedVenue}, ${cleanedVenueCity}`
                      : cleanedVenue || cleanedVenueCity || ''}
                  </Text>
                ) : null}
              </View>
            </View>
          </ImageBackground>
        </View>
      </Pressable>

      {matchStatusPanel ? (
        <MatchdayStatusPanel
          viewState={matchStatusPanel.viewState}
          isGoing={matchStatusPanel.isGoing}
          avatars={matchStatusPanel.avatars}
          count={matchStatusPanel.count}
          titleOverride={matchStatusPanel.titleOverride}
          bodyOverride={matchStatusPanel.bodyOverride}
          socialCopyOverride={matchStatusPanel.socialCopyOverride}
          primaryLabel={matchStatusPanel.primaryLabel}
          primaryDisabled={matchStatusPanel.primaryDisabled}
          onPressPrimary={onPressPrimaryAction || onPress}
          onPressSocial={onPressSocial}
          secondaryActions={matchStatusPanel.secondaryActions}
          style={styles.statusPanel}
        />
      ) : null}
    </View>
  );
};

export default NextMatchBadge;

const createStyles = (theme: ReturnType<typeof useTheme>) => {
  const elevationStyle =
    Platform.OS === 'ios' ? theme.elevation.sm.ios : { elevation: theme.elevation.sm.android };

  return StyleSheet.create({
    wrapper: {
      width: '100%',
      backgroundColor: theme.colors.bg.default,
    },
    outerWrapper: {
      width: '100%',
    },
    badgeCard: {
      borderRadius: theme.radius.none,
      overflow: 'hidden',
      borderWidth: 0,
      borderColor: theme.colors.border.subtle,
      ...elevationStyle,
    },
    heroBackground: {
      width: '100%',
      height: 232,
    },
    topScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '34%',
    },
    mainScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    bottomFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: theme.spacing[12],
    },
    labelChip: {
      position: 'absolute',
      top: theme.spacing[3],
      alignSelf: 'center',
      zIndex: 2,
      backgroundColor: theme.colors.brand.accent,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[1],
    },
    labelText: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    heroContent: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[5],
      paddingTop: theme.spacing[7],
      paddingBottom: theme.spacing[7],
    },
    matchupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[6],
      marginBottom: theme.spacing[4],
    },
    teamLogoContainer: {
      width: theme.spacing[16],
      height: theme.spacing[16],
      justifyContent: 'center',
      alignItems: 'center',
    },
    teamLogo: {
      width: '100%',
      height: '100%',
    },
    teamLogoPlaceholder: {
      backgroundColor: theme.colors.overlay.medium,
      borderRadius: theme.radius.lg,
    },
    teamInitial: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.h2.fontSize,
      fontWeight: '700',
    },
    vsText: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.h3.fontSize,
      fontWeight: '800',
      opacity: 0.92,
    },
    metaBlock: {
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    matchDate: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.body.fontSize,
      fontWeight: '700',
      textAlign: 'center',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    countdownText: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '600',
      opacity: 0.9,
      textAlign: 'center',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    venueText: {
      color: theme.colors.text.inverse,
      fontSize: theme.typography.caption.fontSize,
      fontWeight: '600',
      opacity: 0.88,
      textAlign: 'center',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    statusPanel: {
      marginHorizontal: theme.spacing[3],
      marginTop: -theme.spacing[3],
      marginBottom: theme.spacing[3],
    },
  });
};

