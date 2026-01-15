import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../PrimaryButton';
import { colors, spacing, radius } from '../../theme';

interface SongSuggestCardProps {
  onPressSuggest: () => void;
}

export function SongSuggestCard({ onPressSuggest }: SongSuggestCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons name="musical-notes" size={24} color={colors.fcnRed} />
      </View>
      <Text style={styles.title}>Kender du en sang vi mangler?</Text>
      <Text style={styles.subtitle}>Del den med resten af fællesskabet</Text>
      <PrimaryButton title="Indsend sang" onPress={onPressSuggest} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.ctaBg,
    borderWidth: 2,
    borderColor: colors.fcnRed,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});