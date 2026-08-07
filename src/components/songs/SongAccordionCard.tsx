import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { defaultTheme } from '../../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SpotifyButton } from '../ui/SpotifyButton';

interface SongAccordionCardProps {
  title: string;
  lyrics: string;
  spotifyUrl?: string;
  hasAudio?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenReader?: () => void;
  canEdit?: boolean;
  onPressEdit?: () => void;
  onPressDelete?: () => void;
}

function normalizeLyricsForDisplay(value: string): string[] {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .split('\n');
}

const theme = defaultTheme;

export function SongAccordionCard({
  title,
  lyrics,
  spotifyUrl,
  hasAudio = false,
  isExpanded,
  onToggle,
  onOpenReader,
  canEdit = false,
  onPressEdit,
  onPressDelete,
}: SongAccordionCardProps) {
  const lyricLines = useMemo(() => normalizeLyricsForDisplay(lyrics), [lyrics]);

  return (
    <Card style={styles.card}>
      <Pressable onPress={onToggle} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="musical-notes" size={theme.spacing[5]} color={theme.colors.primary} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{title}</Text>
            {hasAudio ? (
              <View
                style={styles.audioIndicator}
                accessible
                accessibilityLabel="Lydfil tilgængelig"
              >
                <Ionicons
                  name="volume-high-outline"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.brand.accent}
                />
                <Text style={styles.audioIndicatorText}>Lyd</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={theme.spacing[5]}
          color={theme.colors.text.secondary}
        />
      </Pressable>

      {isExpanded ? (
        <View style={styles.expandedContent}>
          <Pressable onPress={onOpenReader} style={styles.lyricsContainer} disabled={!onOpenReader}>
            <View style={styles.lyricsBlock}>
              {lyricLines.map((line, index) => (
                <Text key={`${title}-line-${index}`} style={styles.lyrics}>
                  {line.length > 0 ? line : ' '}
                </Text>
              ))}
            </View>
          </Pressable>
          {canEdit && (onPressEdit || onPressDelete) ? (
            <View style={styles.actions}>
              {onPressEdit ? (
                <Button title="Rediger" variant="outline" size="sm" onPress={onPressEdit} />
              ) : null}
              {onPressDelete ? (
                <Button title="Slet" variant="ghost" size="sm" onPress={onPressDelete} />
              ) : null}
            </View>
          ) : null}
          {spotifyUrl ? <SpotifyButton spotifyUrl={spotifyUrl} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[1],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: theme.spacing[9],
    height: theme.spacing[9],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.pill.yellow.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing[2],
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.text.primary,
    flex: 1,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  audioIndicator: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  audioIndicatorText: {
    ...theme.typography.small,
    color: theme.colors.brand.accent,
  },
  expandedContent: {
    marginTop: theme.spacing[1],
    gap: theme.spacing[2],
  },
  lyricsContainer: {
    backgroundColor: theme.colors.bg.default,
    borderRadius: theme.radius.sm,
    padding: theme.spacing[3],
  },
  lyricsBlock: {
    gap: 0,
  },
  lyrics: {
    ...theme.typography.caption,
    color: theme.colors.text.primary,
  },
  actions: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing[2],
  },
});
