import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import type { FanActivity } from '../../services/fanActivities';
import { getShadowStyle, useTheme } from '../../theme';
import { Text } from '../ui';
import { getFanActivityVisualPreset } from './fanActivityVisualPresets';

type FanActivityHeroCardProps = {
  activity: FanActivity;
  typeLabel: string;
  iconName: keyof typeof Ionicons.glyphMap;
  primaryMeta: string;
  secondaryMeta?: string | null;
  communityName?: string | null;
  onPress?: () => void;
};

export function FanActivityHeroCard({
  activity,
  typeLabel,
  iconName,
  primaryMeta,
  secondaryMeta,
  communityName,
  onPress,
}: FanActivityHeroCardProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const preset = getFanActivityVisualPreset(theme, activity.type);

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
        style={styles.heroImage}
        imageStyle={styles.heroImageShape}
      >
        <View style={styles.imageSoftener} />
        <View
          style={[
            styles.imageTint,
            {
              backgroundColor: preset.overlayColor,
              opacity: preset.overlayOpacity,
            },
          ]}
        />

        <View style={styles.imageTopRow}>
          <Text variant="small" color="muted" style={styles.eyebrow}>
            UDVALGT AKTIVITET
          </Text>
          <View
            style={[
              styles.typePill,
              {
                backgroundColor: preset.chipBg,
                borderColor: theme.colors.bg.card,
              },
            ]}
          >
            <Ionicons
              name={iconName}
              size={theme.typography.small.lineHeight}
              color={preset.accentColor}
            />
            <Text
              variant="small"
              color="secondary"
              style={[styles.typePillText, { color: preset.chipText }]}
            >
              {typeLabel}
            </Text>
          </View>
        </View>
      </ImageBackground>

      <View style={styles.content}>
        <Text variant="h3" color="primary" style={styles.title}>
          {activity.title}
        </Text>

        <Text variant="body" color="primary" style={styles.primaryMeta}>
          {primaryMeta}
        </Text>

        {secondaryMeta ? (
          <Text variant="caption" color="secondary" style={styles.secondaryMeta}>
            {secondaryMeta}
          </Text>
        ) : null}

        {communityName ? (
          <Text variant="small" color="muted" style={styles.communityName}>
            Fra {communityName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    card: {
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      overflow: 'hidden',
    },
    heroImage: {
      minHeight: theme.spacing[16] * 2 + theme.spacing[8],
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
    },
    heroImageShape: {
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
    },
    imageSoftener: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.bg.card,
      opacity: 0.34,
    },
    imageTint: {
      ...StyleSheet.absoluteFillObject,
    },
    imageTopRow: {
      gap: theme.spacing[2],
    },
    eyebrow: {
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    typePill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: theme.spacing[1] / 2,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
    },
    typePillText: {
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    content: {
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[3],
      paddingBottom: theme.spacing[4],
      gap: theme.spacing[1] / 2,
    },
    title: {
      fontWeight: '800',
    },
    primaryMeta: {
      fontWeight: '600',
      lineHeight: theme.spacing[5],
    },
    secondaryMeta: {
      lineHeight: theme.spacing[4],
    },
    communityName: {
      lineHeight: theme.spacing[4],
    },
    pressed: {
      opacity: 0.96,
    },
  });
}
