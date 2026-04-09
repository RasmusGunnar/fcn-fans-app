import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { defaultTheme } from '../../theme';
import { Card } from '../ui/Card';
import { EventSubtypeBadge } from '../ui/EventSubtypeBadge';
import { Text } from '../ui/Text';

interface EventsOverviewMatchCardProps {
  title: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  heroImageUrl: string | null;
  kickoffAt: string;
  venue: string | null;
  venueCity: string | null;
  competition: string | null;
  round: string | null;
  onPress: () => void;
}

const theme = defaultTheme;
const HERO_HEIGHT = theme.spacing[16] + theme.spacing[8] + theme.spacing[4];
const META_SEPARATOR = ' \u00B7 ';

function normalizeShortDateLabel(value: string): string {
  return value.replace(/\.$/, '').trim();
}

function capitalizeLabel(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildMetaLine(params: {
  kickoffAt: string;
  venue: string | null;
  venueCity: string | null;
}): string | null {
  const date = new Date(params.kickoffAt);
  if (Number.isNaN(date.getTime())) return params.venue ?? params.venueCity ?? null;

  const weekday = capitalizeLabel(
    normalizeShortDateLabel(date.toLocaleDateString('da-DK', { weekday: 'short' })),
  );
  const dayMonth = normalizeShortDateLabel(
    date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }),
  );
  const time = date.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const venueLabel = params.venue ?? params.venueCity ?? null;

  return [weekday && `${weekday} ${dayMonth}`, time, venueLabel]
    .filter(Boolean)
    .join(META_SEPARATOR);
}

function buildSecondaryLine(competition: string | null, round: string | null): string | null {
  const value = [competition, round].filter(Boolean).join(META_SEPARATOR).trim();
  return value || null;
}

function getTeamFallback(teamName: string): string {
  return teamName.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'FCN';
}

export function EventsOverviewMatchCard({
  title,
  homeTeam,
  awayTeam,
  homeLogo,
  awayLogo,
  heroImageUrl,
  kickoffAt,
  venue,
  venueCity,
  competition,
  round,
  onPress,
}: EventsOverviewMatchCardProps) {
  const metaLine = buildMetaLine({ kickoffAt, venue, venueCity });
  const secondaryLine = buildSecondaryLine(competition, round);

  return (
    <Card style={styles.card}>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.pressable}>
        <View style={styles.hero}>
          {heroImageUrl ? (
            <Image source={{ uri: heroImageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroFallback} />
          )}

          <View style={styles.heroOverlay} />

          <View style={styles.badgeOverlay}>
            <EventSubtypeBadge subtype="match" overlay />
          </View>

          <View style={styles.h2hOverlay}>
            <View style={styles.logoBadge}>
              {homeLogo ? (
                <Image source={{ uri: homeLogo }} style={styles.logoImage} resizeMode="contain" />
              ) : (
                <Text variant="caption" color="inverse" style={styles.logoFallbackText}>
                  {getTeamFallback(homeTeam)}
                </Text>
              )}
            </View>

            <Text variant="h3" color="inverse" style={styles.vsText}>
              VS
            </Text>

            <View style={styles.logoBadge}>
              {awayLogo ? (
                <Image source={{ uri: awayLogo }} style={styles.logoImage} resizeMode="contain" />
              ) : (
                <Text variant="caption" color="inverse" style={styles.logoFallbackText}>
                  {getTeamFallback(awayTeam)}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text variant="h3" color="primary" numberOfLines={2} style={styles.title}>
            {title}
          </Text>

          {metaLine ? (
            <Text variant="body" color="muted" numberOfLines={1} style={styles.metaLine}>
              {metaLine}
            </Text>
          ) : null}

          {secondaryLine ? (
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {secondaryLine}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.layout.listGap,
    padding: theme.spacing[0],
  },
  pressable: {
    overflow: 'hidden',
  },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: theme.colors.bg.subtle,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.primary,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay.heroScrim,
  },
  badgeOverlay: {
    position: 'absolute',
    top: theme.spacing[3],
    left: theme.spacing[3],
  },
  h2hOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  logoBadge: {
    width: theme.spacing[11],
    height: theme.spacing[11],
    borderRadius: theme.radius.pill,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: theme.spacing[11],
    height: theme.spacing[11],
    transform: [{ scale: 1.08 }],
  },
  logoFallbackText: {
    fontWeight: '700',
  },
  vsText: {
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: theme.layout.cardPadding,
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    gap: theme.spacing[1],
  },
  title: {
    marginBottom: theme.spacing[1],
  },
  metaLine: {
    marginBottom: theme.spacing[1],
  },
});
