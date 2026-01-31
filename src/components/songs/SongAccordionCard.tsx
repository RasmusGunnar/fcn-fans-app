import React from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { SpotifyButton } from '../ui/SpotifyButton';
import { defaultTheme } from '../../theme';

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
  const theme = defaultTheme;
  
  return (
    <Card style={styles.card}>
      <Pressable onPress={onToggle} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="musical-notes" size={20} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.colors.text.secondary}
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

const theme = defaultTheme;

const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[2],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.pill.yellow.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing[2],
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text.primary,
    flex: 1,
  },
  expandedContent: {
    marginTop: theme.spacing[2],
  },
  lyricsContainer: {
    backgroundColor: theme.colors.bg.default,
    borderRadius: theme.radius.sm,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  lyrics: {
    fontSize: 14,
    color: theme.colors.text.primary,
    lineHeight: 20,
  },
});
