import React from 'react';
import { View, Image } from 'react-native';
import { Text } from '../ui/Text';
import { useTheme } from '../../theme';

interface AttendanceBubblesProps {
  avatars: string[];
  count: number;
  max?: number;
  size?: number;
  textVariant?: 'small' | 'body' | 'caption' | 'h1' | 'h2' | 'h3' | 'bodyBold';
}

export function AttendanceBubbles({
  avatars,
  count,
  max = 5,
  size = 20,
  textVariant = 'caption',
}: AttendanceBubblesProps) {
  const theme = useTheme();
  const displayAvatars = avatars.slice(0, max);
  const extraCount = count - displayAvatars.length;

  return (
    <View style={[stylesRow(theme, size)]}>
      {/* Avatar bubbles */}
      {displayAvatars.map((url, i) => (
        <Image
          key={i}
          source={{ uri: url }}
          style={[bubbleStyle(theme, size, i > 0)]}
        />
      ))}
      {/* Extra bubble */}
      {extraCount > 0 && (
        <View style={[extraBubbleStyle(theme, size, displayAvatars.length > 0)]}>
          <Text variant={textVariant} style={{ color: theme.colors.text.inverse, fontWeight: '700' }}>
            +{extraCount}
          </Text>
        </View>
      )}
      {/* Count text */}
      <Text variant={textVariant} style={{ marginLeft: theme.spacing[2], color: theme.colors.text.primary, fontWeight: '600' }}>
        {count} deltager{count === 1 ? '' : 'e'}
      </Text>
    </View>
  );
}

function stylesRow(theme: any, size: number) {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  };
}

function bubbleStyle(theme: any, size: number, overlap: boolean) {
  return {
    width: size,
    height: size,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    borderColor: theme.colors.bg.default,
    marginLeft: overlap ? -size / 3 : 0,
    backgroundColor: theme.colors.bg.surface,
  };
}

function extraBubbleStyle(theme: any, size: number, overlap: boolean) {
  return {
    width: size,
    height: size,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: overlap ? -size / 3 : 0,
  };
}
