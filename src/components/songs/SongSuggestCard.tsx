import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { defaultTheme } from '../../theme';
import { PrimaryButton } from '../PrimaryButton';

interface SongSuggestCardProps {
  onPressSuggest: () => void;
}

const theme = defaultTheme;

export function SongSuggestCard({ onPressSuggest }: SongSuggestCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons
          name="musical-notes"
          size={theme.components.icon.size.md}
          color={theme.colors.primary}
        />
      </View>
      <Text style={styles.title}>Kender du en sang vi mangler?</Text>
      <Text style={styles.subtitle}>Del den med resten af fællesskabet</Text>
      <PrimaryButton title="Indsend sang" onPress={onPressSuggest} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.ctaBg,
    borderWidth: theme.border.hairline,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: theme.radius.md,
    padding: theme.spacing[5],
    alignItems: 'center',
    marginBottom: theme.spacing[2],
  },
  iconContainer: {
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[1],
  },
  subtitle: {
    ...theme.typography.small,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[5],
  },
});
