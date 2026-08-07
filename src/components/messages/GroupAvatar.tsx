import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../ui';
import { useTheme, type Theme } from '../../theme';

export function GroupAvatar({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      {initials ? (
        <Text style={[styles.initials, { fontSize: size * 0.34 }]}>{initials}</Text>
      ) : (
        <Ionicons name="people" size={size * 0.48} color={theme.colors.text.inverse} />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    fallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    initials: { color: theme.colors.text.inverse, fontWeight: '700' },
  });
}
