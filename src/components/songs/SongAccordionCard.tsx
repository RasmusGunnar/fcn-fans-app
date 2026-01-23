import React from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { SpotifyButton } from '../ui/SpotifyButton';
import { colors, spacing, radius } from '../../theme';

interface SongAccordionCardProps {
  title: string;
  lyrics: string;
  spotifyUrl?: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export function SongAccordionCard({
  title,
  lyrics,
  spotifyUrl,
  isExpanded,
  onToggle,
}: SongAccordionCardProps) {
  return (
    <Card style={styles.card}>
      <Pressable onPress={onToggle} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="musical-notes" size={20} color={colors.fcnRed} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.subtext}
        />
      </Pressable>

      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={styles.lyricsContainer}>
            <Text style={styles.lyrics}>{lyrics}</Text>
          </View>
          {spotifyUrl && <SpotifyButton spotifyUrl={spotifyUrl} />}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.softYellowBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  expandedContent: {
    marginTop: spacing.sm,
  },
  lyricsContainer: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  lyrics: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});
