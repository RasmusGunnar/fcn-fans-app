import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Theme, useTheme } from '../../theme';
import { Text } from './Text';

export type EventSubtype = 'event' | 'match' | 'bus_trip';

export type EventSubtypeBadgeProps = {
  subtype: EventSubtype;
  /** When true, uses opaque bg + inverse text for use on dark hero overlays. */
  overlay?: boolean;
};

const resolveSpec = (subtype: EventSubtype) => {
  if (subtype === 'bus_trip') {
    return {
      label: 'Bustur',
      icon: 'bus-outline',
      token: 'busTrip',
    } as const;
  }
  if (subtype === 'match') {
    return {
      label: 'Kamp',
      icon: 'ellipse-outline',
      token: 'event',
    } as const;
  }
  return {
    label: 'Event',
    icon: 'calendar-outline',
    token: 'event',
  } as const;
};

export function EventSubtypeBadge({ subtype, overlay }: EventSubtypeBadgeProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { label, icon, token } = resolveSpec(subtype);

  // Overlay mode: opaque badge bg, inverse (white) text/icon — for dark hero areas
  if (overlay) {
    const overlayBg = token === 'busTrip' ? theme.colors.badges.busTrip : theme.colors.badges.event;
    return (
      <View
        style={[
          styles.badge,
          {
            backgroundColor: overlayBg,
            borderColor: overlayBg,
          },
        ]}
      >
        <Ionicons name={icon as any} size={14} color={theme.colors.text.inverse} />
        <Text variant="small" color="inverse" style={styles.text}>
          {label}
        </Text>
      </View>
    );
  }

  const colors =
    token === 'busTrip'
      ? {
          base: theme.colors.badges.busTrip,
          softBg: theme.colors.badges.busTripSoftBg,
          border: theme.colors.badges.busTripBorder,
        }
      : {
          base: theme.colors.badges.event,
          softBg: theme.colors.badges.eventSoftBg,
          border: theme.colors.badges.eventBorder,
        };

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.softBg,
          borderColor: colors.border,
        },
      ]}
    >
      <Ionicons name={icon as any} size={14} color={colors.base} />
      <Text variant="small" color="primary" style={[styles.text, { color: colors.base }]}>
        {label}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[3] / 2,
      borderRadius: theme.radius.pill,
      borderWidth: theme.layout.borderWidth,
      alignSelf: 'flex-start',
    },
    text: {
      fontSize: 12,
      fontWeight: '500',
    },
  });
}
