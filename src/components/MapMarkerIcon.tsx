import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { colors } from '../theme';

interface MapMarkerIconProps {
  logoUrl?: string | null;
  type: 'match' | 'event';
}

export function MapMarkerIcon({ logoUrl, type }: MapMarkerIconProps) {
  return (
    <View style={styles.container}>
      {/* Pin body */}
      <View style={styles.pin}>
        {/* Logo badge at top */}
        <View style={styles.badge}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logo}
              resizeMode="contain"
            />
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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 54,
    height: 60,
  },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.fcnRed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 28,
    height: 28,
  },
  fallback: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.fcnRed,
  },
  point: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.fcnRed,
    marginTop: -3,
  },
});
