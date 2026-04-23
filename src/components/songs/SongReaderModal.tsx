import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultTheme } from '../../theme';
import type { Song } from '../../types/song';
import { Card } from '../ui/Card';
import { Text } from '../ui';

interface SongReaderModalProps {
  visible: boolean;
  song: Song | null;
  onClose: () => void;
}

function normalizeLyricsForReading(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n').trim();
}

const theme = defaultTheme;

export function SongReaderModal({ visible, song, onClose }: SongReaderModalProps) {
  const insets = useSafeAreaInsets();
  const normalizedLyrics = useMemo(
    () => normalizeLyricsForReading(song?.lyrics ?? ''),
    [song?.lyrics],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons
              name="arrow-back"
              size={theme.components.icon.size.md}
              color={theme.colors.text.primary}
            />
            <Text variant="bodyBold" color="primary">
              Tilbage
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroBlock}>
            <Text variant="h2" color="primary" style={styles.title}>
              {song?.title ?? ''}
            </Text>
            {song?.melodyReference ? (
              <View style={styles.metaRow}>
                <Ionicons
                  name="musical-note-outline"
                  size={theme.components.icon.size.sm}
                  color={theme.colors.text.secondary}
                />
                <Text variant="small" color="secondary" style={styles.metaText}>
                  Melodi: {song.melodyReference}
                </Text>
              </View>
            ) : null}
          </View>

          <Card style={styles.lyricsCard}>
            <View style={styles.lyricsCardHeader}>
              <View style={styles.accentBar} />
              <Text variant="small" color="secondary" style={styles.sectionLabel}>
                Sangtekst
              </Text>
            </View>
            <RNText style={styles.lyrics}>{normalizedLyrics}</RNText>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.bg.default,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    borderBottomWidth: theme.layout.borderHairline,
    borderBottomColor: theme.colors.border.default,
    backgroundColor: theme.colors.bg.surface,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing[2],
    minHeight: theme.spacing[11],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[5],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[4],
  },
  heroBlock: {
    paddingHorizontal: theme.spacing[1],
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  metaText: {
    flex: 1,
  },
  lyricsCard: {
    backgroundColor: theme.colors.bg.surface,
    borderColor: theme.colors.border.default,
  },
  lyricsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  accentBar: {
    width: theme.spacing[1],
    height: theme.spacing[5],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand.accent,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  lyrics: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.h3.fontSize,
    lineHeight: theme.typography.h3.lineHeight + theme.spacing[2],
    fontWeight: theme.typography.body.fontWeight,
  },
});
