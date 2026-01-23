import React from 'react';
import { Pressable, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme';

interface SpotifyButtonProps {
  spotifyUrl: string;
}

export function SpotifyButton({ spotifyUrl }: SpotifyButtonProps) {
  const handlePress = () => {
    Linking.openURL(spotifyUrl);
  };

  return (
    <Pressable onPress={handlePress} style={styles.button}>
      <Ionicons name="musical-notes" size={20} color={colors.card} />
      <Text style={styles.text}>Hør melodien på Spotify</Text>
      <Ionicons name="open-outline" size={20} color={colors.card} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.spotifyGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  text: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: spacing.sm,
  },
});
