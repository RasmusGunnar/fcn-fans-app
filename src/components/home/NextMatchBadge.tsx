// PATCH: NextMatchBadge UI polish (edge-to-edge + bottom row)
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, ImageBackground, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { AttendanceBubbles } from '../social/AttendanceBubbles';

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
  weather?: {
    icon?: string;
    temperature?: string;
    condition?: string;
  };
  matchAttendance?: {
    avatars: string[];
    countGoing: number;
  };
  onPress: () => void;
}

const NextMatchBadge: React.FC<NextMatchBadgeProps> = ({
  match,
  weather,
  matchAttendance,
  onPress,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  if (!match) return null;

  return (
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
          {/* Top and bottom scrims for overlay */}
          <LinearGradient
            colors={[theme.colors.overlay.medium, 'transparent']}
            locations={[0, 0.4]}
            style={styles.topScrim}
          />
          <LinearGradient
            colors={[
              'transparent',
              theme.colors.overlay.heavy,
              theme.mode === 'light' ? theme.colors.text.primary : theme.colors.bg.default,
            ]}
            locations={[0, 0.6, 1]}
            style={styles.bottomScrim}
          />

          {/* Top label badge */}
          <View style={styles.topLabelChip}>
            <Text style={styles.labelText}>NÆSTE HJEMMEKAMP</Text>
          </View>

          {/* Main content */}
          <View style={styles.contentWrapper}>
            <View style={styles.mainContent}>
              {/* Matchup Area: Logos + VS + Teams + Kickoff + Venue */}
              <View style={styles.matchupArea}>
                <View style={styles.matchupRow}>
                  {/* Home Team Logo */}
                  {match.homeLogo ? (
                    <View style={styles.teamLogoContainer}>
                      <Image
                        source={{ uri: match.homeLogo }}
                        style={styles.teamLogo}
                        resizeMode="contain"
                      />
                    </View>
                  ) : (
                    <View style={[styles.teamLogoContainer, styles.teamLogoPlaceholder]}>
                      <Text style={styles.teamInitial}>{match.homeTeam.charAt(0)}</Text>
                    </View>
                  )}

                  {/* VS */}
                  <Text style={styles.vsText}>VS</Text>

                  {/* Away Team Logo */}
                  {match.awayLogo ? (
                    <View style={styles.teamLogoContainer}>
                      <Image
                        source={{ uri: match.awayLogo }}
                        style={styles.teamLogo}
                        resizeMode="contain"
                      />
                    </View>
                  ) : (
                    <View style={[styles.teamLogoContainer, styles.teamLogoPlaceholder]}>
                      <Text style={styles.teamInitial}>{match.awayTeam.charAt(0)}</Text>
                    </View>
                  )}
                </View>

                {/* Team Names */}
                <View style={styles.matchInfo}>
                  <Text style={styles.teamNameSmall}>{match.homeTeam}</Text>
                  <Text style={styles.teamNameSmall}>{match.awayTeam}</Text>
                </View>

                {/* Kickoff */}
                {match.kickoff && <Text style={styles.matchDateTime}>{match.subtitle}</Text>}

                {/* Venue */}
                {(match.venue || match.venueCity) && (
                  <Text style={styles.venueText}>
                    {match.venue && match.venueCity
                      ? `${match.venue}, ${match.venueCity}`
                      : match.venue || match.venueCity || ''}
                  </Text>
                )}
              </View>
            </View>

            {/* Footer bar with translucent background */}
            <View style={styles.footerBar}>
              <View style={styles.footerLeft}>
                {/* Weather */}
                <View style={styles.weatherBox}>
                  <Text style={styles.weatherIcon}>{weather?.icon || '☀️'}</Text>
                  <Text style={styles.weatherTemp}>{weather?.temperature || '—'}</Text>
                  {weather?.condition && (
                    <Text style={styles.weatherCondition} numberOfLines={1}>
                      {weather.condition}
                    </Text>
                  )}
                </View>
                {/* Attendance */}
                {matchAttendance && matchAttendance.countGoing > 0 ? (
                  <AttendanceBubbles
                    avatars={matchAttendance.avatars}
                    count={matchAttendance.countGoing}
                    max={5}
                    size={20}
                    textVariant="caption"
                  />
                ) : (
                  <Text style={styles.attendeeCount}>0 deltager</Text>
                )}
              </View>
              {/* CTA */}
              <Pressable
                onPress={onPress}
                style={styles.ctaButton}
                android_ripple={{ color: theme.colors.overlay.light }}
              >
                <Text style={styles.ctaText}>Læs mere</Text>
              </Pressable>
            </View>
          </View>
        </ImageBackground>
      </View>
    </Pressable>
  );
};

export default NextMatchBadge;

const createStyles = (theme: ReturnType<typeof useTheme>) => {
  const elevationStyle =
    Platform.OS === 'ios' ? theme.elevation.sm.ios : { elevation: theme.elevation.sm.android };

  return StyleSheet.create({
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
      height: 220,
    },
    topScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '40%',
    },
    bottomScrim: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '50%',
    },
    contentWrapper: {
      flex: 1,
      justifyContent: 'space-between',
    },
    mainContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: theme.spacing[6],
      paddingBottom: theme.spacing[12],
      paddingHorizontal: theme.spacing[4],
    },
    topLabelChip: {
      position: 'absolute',
      top: theme.spacing[3],
      left: theme.spacing[3],
      zIndex: 10,
      backgroundColor: theme.colors.brand.accent,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[1],
    },
    labelText: {
      color: theme.colors.text.inverse,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
    },
    title: {
      color: theme.colors.text.inverse,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    subtitle: {
      color: theme.colors.text.inverse,
      fontSize: 14,
      fontWeight: '600',
      opacity: 0.9,
      marginTop: theme.spacing[2],
      textAlign: 'center',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    matchupArea: {
      alignItems: 'center',
      marginTop: theme.spacing[3],
    },
    matchupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[5],
    },
    teamLogoContainer: {
      width: 56,
      height: 56,
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
      fontSize: 20,
      fontWeight: '700',
    },
    vsText: {
      color: theme.colors.text.inverse,
      fontSize: 14,
      fontWeight: '700',
      opacity: 0.8,
    },
    teamNameSmall: {
      color: theme.colors.text.inverse,
      fontSize: 12,
      fontWeight: '600',
      marginTop: theme.spacing[1],
    },
    matchInfo: {
      alignItems: 'center',
      marginTop: theme.spacing[2],
    },
    matchDateTime: {
      color: theme.colors.text.inverse,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    venueText: {
      color: theme.colors.text.inverse,
      fontSize: 12,
      opacity: 0.8,
      marginTop: theme.spacing[1],
      textAlign: 'center',
      textShadowColor: theme.colors.overlay.textShadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    footerBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.overlay.heavy,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
    },
    footerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: theme.spacing[4],
    },
    weatherBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    weatherIcon: {
      color: theme.colors.text.inverse,
      fontSize: 14,
    },
    weatherTemp: {
      color: theme.colors.text.inverse,
      fontSize: 13,
      fontWeight: '600',
    },
    weatherCondition: {
      color: theme.colors.text.inverse,
      fontSize: 11,
      opacity: 0.7,
    },
    attendeesBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    avatarStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatar: {
      width: 22,
      height: 22,
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      borderColor: theme.mode === 'light' ? theme.colors.text.primary : theme.colors.bg.default,
    },
    attendeeCount: {
      color: theme.colors.text.inverse,
      fontSize: 12,
      fontWeight: '600',
    },
    ctaButton: {
      backgroundColor: theme.colors.brand.accent,
      borderRadius: theme.radius.pill,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[2],
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    ctaText: {
      color: theme.colors.text.inverse,
      fontSize: 13,
      fontWeight: '700',
    },
  });
};
