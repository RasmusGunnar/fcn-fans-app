import React from 'react';
import { ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import { getShadowStyle, useTheme } from '../../theme';
import type { FeedFanActivityData } from '../../types/feed';
import { Text } from '../ui';
import { getFanActivityVisualPreset } from './fanActivityVisualPresets';

type FanActivityFeedCardProps = {
  item: FeedFanActivityData;
  onPress?: () => void;
};

function formatTypeLabel(type: string): string {
  const normalized = type.trim();
  if (!normalized) {
    return 'Aktivitet';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMeta(item: FeedFanActivityData): string {
  const start = item.startsAt ? new Date(item.startsAt) : null;
  const location = item.locationName?.trim() || item.locationAddress?.trim() || null;

  if (!start || Number.isNaN(start.getTime())) {
    return location || 'Tidspunkt kommer';
  }

  const dateLabel = start.toLocaleDateString('da-DK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = start.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return [dateLabel, `kl. ${timeLabel}`, location].filter(Boolean).join(' / ');
}

function getSourceLabel(item: FeedFanActivityData): string | null {
  const communityName = item.communityName?.trim() || null;
  if (communityName) {
    return `Fra ${communityName}`;
  }

  return item.parentType === 'match' ? 'Omkring kampdagen' : 'Omkring eventet';
}

function formatRegistrationLine(item: FeedFanActivityData): string | null {
  if (!item.registrationEnabled) {
    return null;
  }

  const reservedCount = Math.max(0, item.registrationReservedCount ?? 0);
  const capacity =
    typeof item.registrationCapacity === 'number' && item.registrationCapacity > 0
      ? item.registrationCapacity
      : null;
  const price =
    (item.registrationPaymentMode === 'manual' || (item.registrationPriceDkk ?? 0) > 0)
      ? `${Math.max(0, item.registrationPriceDkk ?? 0)} kr`
      : 'Gratis';
  const capacityLabel = capacity
    ? `${reservedCount}/${capacity} deltagere`
    : reservedCount === 1
      ? '1 deltager'
      : `${reservedCount} deltagere`;
  const availabilityLabel = capacity && reservedCount >= capacity ? 'Fuldt booket' : null;

  return ['Tilmelding', capacityLabel, price, availabilityLabel].filter(Boolean).join(' · ');
}

export function FanActivityFeedCard({ item, onPress }: FanActivityFeedCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const preset = getFanActivityVisualPreset(theme, item.type);
  const sourceLabel = getSourceLabel(item);
  const registrationLine = formatRegistrationLine(item);
  const hasCta = Boolean(item.ctaLabel?.trim() && item.ctaUrl?.trim());
  const ctaLabel = item.ctaLabel?.trim() || 'Se aktivitet';

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        getShadowStyle(theme, 'sm'),
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <ImageBackground
        source={preset.source}
        resizeMode="cover"
        style={styles.hero}
        imageStyle={styles.heroImage}
      >
        <View style={styles.heroSoftener} />
        <View
          style={[
            styles.heroTint,
            {
              backgroundColor: preset.overlayColor,
              opacity: preset.overlayOpacity * 0.7,
            },
          ]}
        />
      </ImageBackground>

      <View style={styles.content}>
        <View
          style={[
            styles.typePill,
            {
              backgroundColor: preset.gridTintBg,
              borderColor: theme.colors.border.subtle,
            },
          ]}
        >
          <Text
            variant="small"
            color="muted"
            style={[styles.typePillText, { color: preset.chipText }]}
            numberOfLines={1}
          >
            {formatTypeLabel(item.type)}
          </Text>
        </View>

        <Text variant="h3" color="primary" numberOfLines={2} style={styles.title}>
          {item.title}
        </Text>

        <Text variant="small" color="secondary" style={styles.meta} numberOfLines={2}>
          {formatMeta(item)}
        </Text>

        {sourceLabel ? (
          <Text variant="small" color="muted" numberOfLines={1} style={styles.source}>
            {sourceLabel}
          </Text>
        ) : null}

        {registrationLine ? (
          <Text
            variant="small"
            color="secondary"
            numberOfLines={2}
            style={styles.registrationMeta}
          >
            {registrationLine}
          </Text>
        ) : null}

        {hasCta ? (
          <View style={styles.ctaWrap}>
            <View style={styles.ctaButton}>
              <Text variant="bodyBold" color="inverse" numberOfLines={1} style={styles.ctaText}>
                {ctaLabel}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    card: {
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      overflow: 'hidden',
    },
    hero: {
      width: '100%',
      aspectRatio: 16 / 8.8,
      justifyContent: 'flex-end',
    },
    heroImage: {
      borderTopLeftRadius: theme.radius.md,
      borderTopRightRadius: theme.radius.md,
    },
    heroSoftener: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.bg.card,
      opacity: 0.08,
    },
    heroTint: {
      ...StyleSheet.absoluteFillObject,
    },
    content: {
      paddingHorizontal: theme.spacing[3],
      paddingTop: theme.spacing[2] + theme.spacing[1] / 2,
      paddingBottom: theme.spacing[2] + theme.spacing[1] / 2,
      gap: theme.spacing[1] + theme.spacing[1] / 2,
    },
    typePill: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing[1] + theme.spacing[1] / 2,
      paddingVertical: theme.spacing[1] / 3,
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
    },
    typePillText: {
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    title: {
      fontWeight: '800',
    },
    meta: {
      lineHeight: theme.spacing[3] + theme.spacing[1] / 2,
    },
    source: {
      marginTop: -theme.spacing[1] / 3,
    },
    registrationMeta: {
      lineHeight: theme.spacing[3] + theme.spacing[1] / 2,
    },
    ctaWrap: {
      paddingTop: theme.spacing[1],
    },
    ctaButton: {
      alignSelf: 'flex-start',
      minHeight: theme.spacing[8],
      paddingHorizontal: theme.spacing[3] + theme.spacing[1] / 2,
      paddingVertical: theme.spacing[1] + theme.spacing[1] / 2,
      borderRadius: theme.components.button.radius,
      backgroundColor: theme.components.button.variants.primary.bg,
      justifyContent: 'center',
    },
    ctaText: {
      color: theme.components.button.variants.primary.text,
    },
    pressed: {
      opacity: 0.96,
    },
  });
}
