import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { defaultTheme } from '../../theme';

interface SpotifyButtonProps {
  spotifyUrl: string;
}

const theme = defaultTheme;
const SPOTIFY_LABEL = 'H\u00F8r melodien p\u00E5 Spotify';
const OPEN_ERROR_TITLE = 'Kunne ikke \u00E5bne link';
const OPEN_ERROR_MESSAGE = 'Spotify-linket kunne ikke \u00E5bnes lige nu.';

export function SpotifyButton({ spotifyUrl }: SpotifyButtonProps) {
  const handlePress = async () => {
    try {
      await Linking.openURL(spotifyUrl);
    } catch {
      Alert.alert(OPEN_ERROR_TITLE, OPEN_ERROR_MESSAGE);
    }
  };

  return (
    <Pressable onPress={handlePress} style={styles.button}>
      <Ionicons name="musical-notes" size={theme.spacing[5]} color={theme.colors.text.inverse} />
      <Text style={styles.text}>{SPOTIFY_LABEL}</Text>
      <Ionicons name="open-outline" size={theme.spacing[5]} color={theme.colors.text.inverse} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.spotifyGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.md,
    marginTop: theme.spacing[2],
    gap: theme.spacing[2],
  },
  text: {
    ...theme.typography.small,
    color: theme.colors.text.inverse,
    flexShrink: 1,
    textAlign: 'center',
  },
});
