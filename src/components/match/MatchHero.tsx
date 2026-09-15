import React from 'react';
import { Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

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
  energized = false,
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
  energized?: boolean;
}) {
  return (
    <View testID="match-hero" style={styles.hero}>
      <ImageBackground
        source={imageUrl ? { uri: imageUrl } : require('../../../assets/stadium-hero.png')}
        style={styles.photo}
        resizeMode="cover"
      >
        <LinearGradient
          colors={
            energized
              ? ['rgba(169, 23, 58, 0.92)', 'rgba(90, 8, 34, 0.93)', 'rgba(33, 4, 16, 0.98)']
              : ['rgba(128, 19, 48, 0.88)', 'rgba(67, 8, 29, 0.94)', 'rgba(25, 4, 14, 0.98)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
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
                  <View style={styles.crestPlate}>
                    <Image
                      source={{ uri: team.logo }}
                      style={styles.crest}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  </View>
                ) : (
                  <View style={[styles.crestPlate, styles.crestFallback]}>
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
          <Ionicons name="calendar-outline" size={15} color="#F2BECA" />
          <Text style={styles.date}>{date}</Text>
        </View>
        {venue ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={15} color="#D3BBC2" />
            <Text style={styles.venue}>{venue}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#230C15' },
  photo: {
    minHeight: 166,
    backgroundColor: '#230C15',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
  },
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
    color: '#FFF2DC',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,211,176,0.42)',
    overflow: 'hidden',
    backgroundColor: 'rgba(33,4,16,0.56)',
    flexShrink: 1,
  },
  teams: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  team: { flex: 1, alignItems: 'center', gap: 5 },
  crest: { width: 70, height: 70 },
  crestPlate: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,248,238,0.82)',
    backgroundColor: 'rgba(255,248,238,0.96)',
    shadowColor: '#16050D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
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
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 17,
  },
  score: {
    color: '#F1CBA6',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    flexShrink: 1,
  },
  meta: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: {
    color: '#FFF8FA',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    flex: 1,
  },
  venue: { color: '#D3BBC2', fontSize: 12, lineHeight: 16, flex: 1 },
});
