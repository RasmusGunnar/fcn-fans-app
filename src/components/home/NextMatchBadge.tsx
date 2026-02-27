
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { useTheme } from '../../theme';
import AttendanceBubbles from '../social/AttendanceBubbles';

interface NextMatchBadgeProps {
  match: {
    coverUrl: string;
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

const NextMatchBadge: React.FC<NextMatchBadgeProps> = ({ match, weather, matchAttendance, onPress }) => {
  if (!match) return null;
  const theme = useTheme();
  const styles = createStyles(theme);
  // Use theme gradients for overlays
  const gradientColors = theme.gradients.imageHeaderOverlay.colors.slice().reverse();
  const footerGradientColors = theme.gradients.imageHeaderOverlay.colors;

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

          {/* Main content */}
          <View style={styles.contentWrapper}>
            <View style={styles.mainContent}>
              {/* Top label */}
              <View style={styles.topLabelChip}>
                <Text style={styles.labelText}>NÆSTE HJEMMEKAMP</Text>
              </View>
              {/* Title and subtitle */}
              <Text style={styles.title}>{match.title}</Text>
              <Text style={styles.subtitle}>{match.subtitle}</Text>
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
                  <Text style={{ color: theme.colors.text.primary, fontWeight: '600' }}>
                    0 deltager
                  </Text>
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
  const elevationStyle = Platform.OS === 'ios' 
    ? theme.elevation.sm.ios 
    : { elevation: theme.elevation.sm.android };

  return StyleSheet.create({
    outerWrapper: {
      width: '100%',
    },
    badgeCard: {
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
      borderWidth: theme.layout.borderHairline,
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
      paddingTop: theme.spacing[4],
      paddingHorizontal: theme.spacing[4],
    },
    topLabelChip: {
      alignSelf: 'flex-start',
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.overlay.heavy,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
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
