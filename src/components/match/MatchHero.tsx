import React from 'react';
import { Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';

/** Presentation only: callers retain fixture selection, status and navigation. */
export function MatchHero({
  imageUrl,
  homeTeam,
  awayTeam,
  homeLogo,
  awayLogo,
  badge,
  date,
  venue,
  status,
  centerLabel = 'VS',
}: {
  imageUrl?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  badge: string;
  date: string;
  venue?: string | null;
  status?: string | null;
  centerLabel?: string;
}) {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View testID="match-hero" style={styles.hero}>
      <ImageBackground
        source={imageUrl ? { uri: imageUrl } : require('../../../assets/stadium-hero.png')}
        style={styles.photo}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(30, 8, 14, 0.38)', 'rgba(30, 8, 14, 0.82)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.topline}>
          <Text style={styles.badge}>{badge}</Text>
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
        <View style={styles.teams}>
          {[
            { name: homeTeam, logo: homeLogo },
            { name: awayTeam, logo: awayLogo },
          ].map((team, index) => (
            <React.Fragment key={index}>
              {index === 1 ? <Text style={styles.score}>{centerLabel}</Text> : null}
              <View style={styles.team}>
                {team.logo ? (
                  <Image
                    source={{ uri: team.logo }}
                    style={styles.crest}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View style={[styles.crest, styles.crestFallback]}>
                    <Text style={styles.initials}>{team.name.substring(0, 3).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.teamName}>{team.name}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </ImageBackground>
      <View style={styles.meta}>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={15} color={theme.colors.primaryDark} />
          <Text style={styles.date}>{date}</Text>
        </View>
        {venue ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={15} color={theme.colors.text.secondary} />
            <Text style={styles.venue}>{venue}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    hero: { backgroundColor: theme.colors.bg.card },
    photo: { minHeight: 174, backgroundColor: theme.colors.primaryDark, padding: 16, gap: 18 },
    topline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      flexWrap: 'wrap',
    },
    badge: {
      color: '#fff',
      fontSize: 10,
      lineHeight: 15,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      flexShrink: 1,
    },
    status: {
      color: '#fff',
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '600',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.13)',
      flexShrink: 1,
    },
    teams: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 2 },
    team: { flex: 1, alignItems: 'center', gap: 8 },
    crest: { width: 60, height: 60 },
    crestFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.1)',
    },
    initials: { color: '#fff', fontSize: 18, fontWeight: '800' },
    teamName: {
      color: '#fff',
      textAlign: 'center',
      fontWeight: '600',
      fontSize: 12,
      lineHeight: 17,
    },
    score: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 0.5,
      textAlign: 'center',
      flexShrink: 1,
    },
    meta: { paddingHorizontal: 16, paddingVertical: 12, gap: 5 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    date: {
      color: theme.colors.text.primary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      flex: 1,
    },
    venue: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17, flex: 1 },
  });
