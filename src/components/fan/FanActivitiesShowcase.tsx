import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { FanActivity } from '../../services/fanActivities';
import { useTheme } from '../../theme';
import { Text } from '../ui';
import { FanActivityCompactCard } from './FanActivityCompactCard';
import { FanActivityHeroCard } from './FanActivityHeroCard';

type FanActivitiesShowcaseProps = {
  activities: FanActivity[];
  emptyText?: string;
  onPressActivity?: (activity: FanActivity) => void;
};

function formatFanActivityTypeLabel(type: string): string {
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

function formatFanActivityDateTime(activity: FanActivity): string {
  const start = new Date(activity.starts_at);
  if (Number.isNaN(start.getTime())) {
    return 'Tidspunkt kommer';
  }

  const dateLabel = start.toLocaleDateString('da-DK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const startTime = start.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (!activity.ends_at) {
    return `${dateLabel}, kl. ${startTime}`;
  }

  const end = new Date(activity.ends_at);
  if (Number.isNaN(end.getTime())) {
    return `${dateLabel}, kl. ${startTime}`;
  }

  const endTime = end.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (start.toDateString() === end.toDateString()) {
    return `${dateLabel}, kl. ${startTime}-${endTime}`;
  }

  const endDateLabel = end.toLocaleDateString('da-DK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return `${dateLabel}, kl. ${startTime} - ${endDateLabel}, kl. ${endTime}`;
}

function getFanActivityLocation(activity: FanActivity): string | null {
  const parts = [activity.location_name, activity.location_address]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return Array.from(new Set(parts)).join(', ');
}

function formatCompactMeta(activity: FanActivity): string {
  const start = new Date(activity.starts_at);
  const location = getFanActivityLocation(activity);

  if (Number.isNaN(start.getTime())) {
    return location || 'Tidspunkt kommer';
  }

  const dayLabel = start.toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'short',
  });
  const timeLabel = start.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return [dayLabel, timeLabel, location].filter(Boolean).join(' / ');
}

function getFanActivityIcon(type: string): keyof typeof Ionicons.glyphMap {
  const normalized = type.trim().toLowerCase();

  if (normalized.includes('bus') || normalized.includes('transport')) {
    return 'bus-outline';
  }

  if (
    normalized.includes('optakt') ||
    normalized.includes('samling') ||
    normalized.includes('mad') ||
    normalized.includes('bar') ||
    normalized.includes('pub')
  ) {
    return 'restaurant-outline';
  }

  if (normalized.includes('sang') || normalized.includes('tifo')) {
    return 'flag-outline';
  }

  if (normalized.includes('march')) {
    return 'walk-outline';
  }

  return 'calendar-outline';
}

export function FanActivitiesShowcase({
  activities,
  emptyText = 'Ingen fanaktiviteter endnu.',
  onPressActivity,
}: FanActivitiesShowcaseProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  if (activities.length === 0) {
    return (
      <Text variant="caption" color="secondary" style={styles.emptyText}>
        {emptyText}
      </Text>
    );
  }

  const [heroActivity, ...remainingActivities] = activities;
  const heroLocation = getFanActivityLocation(heroActivity);
  const heroCommunityName = heroActivity.community?.name?.trim() || null;

  return (
    <View style={styles.container}>
      <FanActivityHeroCard
        activity={heroActivity}
        typeLabel={formatFanActivityTypeLabel(heroActivity.type)}
        iconName={getFanActivityIcon(heroActivity.type)}
        primaryMeta={formatFanActivityDateTime(heroActivity)}
        secondaryMeta={heroLocation}
        communityName={heroCommunityName}
        onPress={onPressActivity ? () => onPressActivity(heroActivity) : undefined}
      />

      {remainingActivities.length > 0 ? (
        <View style={styles.compactList}>
          {remainingActivities.map((activity) => (
            <FanActivityCompactCard
              key={activity.id}
              activity={activity}
              typeLabel={formatFanActivityTypeLabel(activity.type)}
              iconName={getFanActivityIcon(activity.type)}
              meta={formatCompactMeta(activity)}
              onPress={onPressActivity ? () => onPressActivity(activity) : undefined}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: {
      gap: theme.spacing[4],
    },
    compactList: {
      gap: theme.spacing[2] + theme.spacing[1] / 2,
    },
    emptyText: {
      lineHeight: theme.spacing[4],
    },
  });
}
