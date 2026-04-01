import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import type { FanActivity } from '../../services/fanActivities';
import { getShadowStyle, useTheme } from '../../theme';
import { Text } from '../ui';
import { getFanActivityVisualPreset } from './fanActivityVisualPresets';

type FanActivityCompactCardProps = {
  activity: FanActivity;
  typeLabel: string;
  iconName: keyof typeof Ionicons.glyphMap;
  meta: string;
  onPress?: () => void;
};

export function FanActivityCompactCard({
  activity,
  typeLabel,
  meta,
  onPress,
}: FanActivityCompactCardProps) {
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
        style={styles.thumb}
        imageStyle={styles.thumbImage}
      >
        <View style={styles.thumbSoftener} />
        <View
          style={[
            styles.thumbTint,
            {
              backgroundColor: preset.overlayColor,
              opacity: preset.overlayOpacity * 0.8,
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
            {typeLabel}
          </Text>
        </View>

        <Text variant="bodyBold" color="primary" numberOfLines={2} style={styles.title}>
          {activity.title}
        </Text>

        <Text variant="small" color="secondary" style={styles.meta} numberOfLines={2}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.card,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      overflow: 'hidden',
    },
    thumb: {
      width: theme.spacing[16] + theme.spacing[2],
      minHeight: theme.spacing[16] + theme.spacing[3],
      justifyContent: 'flex-end',
    },
    thumbImage: {
      borderTopLeftRadius: theme.radius.md,
      borderBottomLeftRadius: theme.radius.md,
    },
    thumbSoftener: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.bg.card,
      opacity: 0.2,
    },
    thumbTint: {
      ...StyleSheet.absoluteFillObject,
    },
    content: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: theme.spacing[2] + theme.spacing[1] / 2,
      paddingVertical: theme.spacing[1] + theme.spacing[1] / 2,
      gap: theme.spacing[1] / 3,
    },
    typePill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing[1] + theme.spacing[1] / 2,
      paddingVertical: theme.spacing[1] / 3,
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
    },
    typePillText: {
      fontWeight: '600',
      textTransform: 'uppercase',
      flexShrink: 1,
    },
    title: {
      fontWeight: '700',
    },
    meta: {
      lineHeight: theme.spacing[3] + theme.spacing[1] / 2,
    },
    pressed: {
      opacity: 0.96,
    },
  });
}
