import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useTheme, Theme } from '../theme';

interface MapMarkerIconProps {
  logoUrl?: string | null;
  type: 'match' | 'event' | 'community' | 'fan_faction';
}

export function MapMarkerIcon({ logoUrl, type }: MapMarkerIconProps) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      {/* Pin body */}
      <View style={styles.pin}>
        {/* Logo badge at top */}
        <View style={styles.badge}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="cover" />
          ) : (
            <View style={styles.fallback}>
              <View style={styles.fallbackDot} />
            </View>
          )}
        </View>
      </View>
      {/* Pin point */}
      <View style={styles.point} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      width: 54,
      height: 60,
    },
    pin: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: theme.colors.bg.elevated,
      // Shadow removed per design system rules
    },
    badge: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    logo: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
    },
    fallback: {
      width: 28,
      height: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    fallbackDot: {
      width: theme.spacing[3],
      height: theme.spacing[3],
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.primary,
    },
    point: {
      width: 0,
      height: 0,
      borderLeftWidth: theme.spacing[2],
      borderRightWidth: theme.spacing[2],
      borderTopWidth: theme.spacing[3],
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: theme.colors.primary,
      marginTop: -3,
    },
  });
}
