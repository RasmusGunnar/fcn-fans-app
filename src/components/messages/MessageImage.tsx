import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui';
import { useTheme, type Theme } from '../../theme';

export function MessageImage({
  uri,
  width,
  height,
  onPress,
}: {
  uri: string | null;
  width: number | null;
  height: number | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [loading, setLoading] = useState(Boolean(uri));
  const [failed, setFailed] = useState(false);
  const aspectRatio = width && height ? Math.max(0.6, Math.min(1.8, width / height)) : 1;

  if (!uri || failed) {
    return (
      <View style={[styles.frame, styles.fallback, { aspectRatio }]}>
        <Ionicons name="image-outline" size={28} color={theme.colors.text.muted} />
        <Text variant="small" color="muted">
          Billedet kunne ikke hentes
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.frame, { aspectRatio }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Aabn billede"
    >
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
      />
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    frame: {
      width: 240,
      maxWidth: '100%',
      minHeight: 140,
      overflow: 'hidden',
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
    },
    image: { width: '100%', height: '100%' },
    loader: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
    },
    fallback: { alignItems: 'center', justifyContent: 'center', gap: theme.spacing[2] },
  });
}
