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
import { SafeAreaView } from 'react-native-safe-area-context';
import { defaultTheme } from '../../theme';
import type { Song } from '../../types/song';
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
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
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
          <Text variant="h2" color="primary" style={styles.title}>
            {song?.title ?? ''}
          </Text>
          <RNText style={styles.lyrics}>{normalizedLyrics}</RNText>
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
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.layout.borderHairline,
    borderBottomColor: theme.colors.border.default,
    backgroundColor: theme.colors.bg.surface,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[8],
  },
  title: {
    marginBottom: theme.spacing[5],
  },
  lyrics: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.h3.fontSize,
    lineHeight: theme.typography.h3.lineHeight + theme.spacing[1],
    fontWeight: theme.typography.body.fontWeight,
  },
});
