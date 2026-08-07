import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { pickSongAudioFile } from '../../services/songAudio';
import { defaultTheme } from '../../theme';
import type { Song, SongCategory } from '../../types/song';
import {
  formatSongAudioSize,
  SongAudioValidationError,
  type SongAudioChange,
} from '../../utils/songAudio';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';

const theme = defaultTheme;

const CATEGORY_ITEMS = [
  { key: 'slagsang', label: 'Slagsang' },
  { key: 'spillersang', label: 'Spillersang' },
] as const satisfies readonly { key: SongCategory; label: string }[];

type SongEditModalProps = {
  visible: boolean;
  song: Song | null;
  saving: boolean;
  uploadProgress?: number | null;
  onClose: () => void;
  onSave: (values: {
    title: string;
    lyrics: string;
    category: SongCategory;
    spotifyUrl: string | null;
    audioChange: SongAudioChange;
  }) => void;
};

function getAudioPickerError(error: unknown): string {
  if (error instanceof SongAudioValidationError) {
    if (error.code === 'too_large') return 'Lydfilen er for stor. Maks. 25 MB.';
    if (error.code === 'empty_file') return 'Lydfilen er tom og kan ikke bruges.';
    return 'Filformatet understøttes ikke. Brug MP3, M4A eller AAC.';
  }
  return 'Lydfilen kunne ikke læses. Prøv igen.';
}

export function SongEditModal({
  visible,
  song,
  saving,
  uploadProgress,
  onClose,
  onSave,
}: SongEditModalProps) {
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [category, setCategory] = useState<SongCategory>('slagsang');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [audioChange, setAudioChange] = useState<SongAudioChange>({ kind: 'keep' });
  const [pickingAudio, setPickingAudio] = useState(false);

  useEffect(() => {
    if (!song) return;
    setTitle(song.title);
    setLyrics(song.lyrics);
    setCategory(song.category);
    setSpotifyUrl(song.spotifyUrl ?? '');
    setAudioChange({ kind: 'keep' });
    setPickingAudio(false);
  }, [song]);

  const disabled = useMemo(() => {
    return saving || pickingAudio || !title.trim() || !lyrics.trim();
  }, [lyrics, pickingAudio, saving, title]);

  const handlePickAudio = async () => {
    if (!song || saving || pickingAudio) return;
    try {
      setPickingAudio(true);
      const file = await pickSongAudioFile(song.id);
      if (file) setAudioChange({ kind: 'replace', file });
    } catch (error) {
      Alert.alert('Lydfil', getAudioPickerError(error));
    } finally {
      setPickingAudio(false);
    }
  };

  const handleRemoveAudio = () => {
    if (!song?.audioPath || saving) return;
    Alert.alert('Fjern lydfil', 'Lydfilen fjernes først, når du gemmer ændringerne.', [
      { text: 'Annuller', style: 'cancel' },
      { text: 'Fjern', style: 'destructive', onPress: () => setAudioChange({ kind: 'remove' }) },
    ]);
  };

  const currentAudioSize = formatSongAudioSize(song?.audioSizeBytes);
  const selectedAudioSize =
    audioChange.kind === 'replace' ? formatSongAudioSize(audioChange.file.size) : null;
  const isUploading = saving && uploadProgress != null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <Text style={styles.title}>Rediger sang</Text>

          <ScrollView
            style={styles.form}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.field}>
              <Text style={styles.label}>Titel</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Sangtitel"
                placeholderTextColor={theme.colors.text.secondary}
                editable={!saving}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Kategori</Text>
              <SegmentedControl
                items={CATEGORY_ITEMS}
                activeKey={category}
                onChange={setCategory}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Tekst</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={lyrics}
                onChangeText={setLyrics}
                placeholder="Sangtekst"
                placeholderTextColor={theme.colors.text.secondary}
                editable={!saving}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Spotify-link (valgfrit)</Text>
              <TextInput
                style={styles.input}
                value={spotifyUrl}
                onChangeText={setSpotifyUrl}
                placeholder="https://open.spotify.com/..."
                placeholderTextColor={theme.colors.text.secondary}
                editable={!saving}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>

            <View style={styles.audioSection}>
              <View style={styles.field}>
                <Text style={styles.label}>Lydfil</Text>
                {audioChange.kind === 'replace' ? (
                  <View style={styles.audioDetails}>
                    <Text style={styles.audioStatus}>Ny lydfil valgt</Text>
                    <Text style={styles.audioMeta} numberOfLines={2}>
                      {audioChange.file.name} · {audioChange.file.extension.toUpperCase()}
                      {selectedAudioSize ? ` · ${selectedAudioSize}` : ''}
                    </Text>
                  </View>
                ) : song?.audioPath && audioChange.kind !== 'remove' ? (
                  <View style={styles.audioDetails}>
                    <Text style={styles.audioStatus}>Lydfil tilknyttet</Text>
                    <Text style={styles.audioMeta}>
                      {song.audioMimeType === 'audio/mpeg'
                        ? 'MP3'
                        : song.audioMimeType === 'audio/mp4'
                          ? 'M4A'
                          : 'AAC'}
                      {currentAudioSize ? ` · ${currentAudioSize}` : ''}
                    </Text>
                  </View>
                ) : audioChange.kind === 'remove' ? (
                  <Text style={styles.audioMeta}>Lydfilen fjernes, når du gemmer.</Text>
                ) : (
                  <Text style={styles.audioMeta}>Ingen lydfil tilknyttet.</Text>
                )}
              </View>

              <View style={styles.audioActions}>
                <Button
                  title={
                    pickingAudio
                      ? 'Åbner...'
                      : song?.audioPath || audioChange.kind === 'replace'
                        ? 'Erstat lydfil'
                        : 'Tilføj lydfil'
                  }
                  variant="outline"
                  size="sm"
                  onPress={() => void handlePickAudio()}
                  disabled={saving || pickingAudio}
                />
                {audioChange.kind === 'replace' ? (
                  <Button
                    title="Fjern valgt fil"
                    variant="ghost"
                    size="sm"
                    onPress={() => setAudioChange({ kind: 'keep' })}
                    disabled={saving}
                  />
                ) : song?.audioPath && audioChange.kind !== 'remove' ? (
                  <Button
                    title="Fjern lydfil"
                    variant="ghost"
                    size="sm"
                    onPress={handleRemoveAudio}
                    disabled={saving}
                  />
                ) : audioChange.kind === 'remove' ? (
                  <Button
                    title="Fortryd fjernelse"
                    variant="ghost"
                    size="sm"
                    onPress={() => setAudioChange({ kind: 'keep' })}
                    disabled={saving}
                  />
                ) : null}
              </View>

              {isUploading ? (
                <View style={styles.uploadStatus}>
                  <View style={styles.uploadStatusRow}>
                    <ActivityIndicator size="small" color={theme.colors.brand.accent} />
                    <Text style={styles.uploadText}>
                      Uploader lyd... {Math.round(uploadProgress * 100)}%
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.max(0, Math.min(100, uploadProgress * 100))}%` },
                      ]}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Button title="Annuller" variant="ghost" onPress={onClose} disabled={saving} />
            <Button
              title={isUploading ? 'Uploader...' : saving ? 'Gemmer...' : 'Gem'}
              onPress={() =>
                onSave({
                  title,
                  lyrics,
                  category,
                  spotifyUrl: spotifyUrl.trim() ? spotifyUrl.trim() : null,
                  audioChange,
                })
              }
              disabled={disabled}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay.medium,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.colors.bg.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[6],
    gap: theme.spacing[4],
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.text.primary,
  },
  form: {
    maxHeight: theme.spacing[16] * 4,
  },
  formContent: {
    gap: theme.spacing[4],
  },
  field: {
    gap: theme.spacing[2],
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.text.secondary,
  },
  input: {
    borderWidth: theme.layout.borderWidth,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.default,
    color: theme.colors.text.primary,
    ...theme.typography.body,
  },
  inputMultiline: {
    minHeight: theme.spacing[16],
  },
  audioSection: {
    gap: theme.spacing[3],
    paddingTop: theme.spacing[1],
  },
  audioDetails: {
    gap: theme.spacing[1],
  },
  audioStatus: {
    ...theme.typography.bodyBold,
    color: theme.colors.text.primary,
  },
  audioMeta: {
    ...theme.typography.small,
    color: theme.colors.text.secondary,
  },
  audioActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  uploadStatus: {
    gap: theme.spacing[2],
  },
  uploadStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  uploadText: {
    ...theme.typography.small,
    color: theme.colors.text.primary,
  },
  progressTrack: {
    height: theme.spacing[1],
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg.subtle,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.brand.accent,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
  },
});
