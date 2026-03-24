import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { defaultTheme } from '../../theme';
import type { Song, SongCategory } from '../../types/song';

const theme = defaultTheme;

const CATEGORY_ITEMS = [
  { key: 'slagsang', label: 'Slagsang' },
  { key: 'spillersang', label: 'Spillersang' },
] as const satisfies readonly { key: SongCategory; label: string }[];

type SongEditModalProps = {
  visible: boolean;
  song: Song | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: { title: string; lyrics: string; category: SongCategory }) => void;
};

export function SongEditModal({ visible, song, saving, onClose, onSave }: SongEditModalProps) {
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [category, setCategory] = useState<SongCategory>('slagsang');

  useEffect(() => {
    if (!song) return;
    setTitle(song.title);
    setLyrics(song.lyrics);
    setCategory(song.category);
  }, [song]);

  const disabled = useMemo(() => {
    return saving || !title.trim() || !lyrics.trim();
  }, [lyrics, saving, title]);

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
              <SegmentedControl items={CATEGORY_ITEMS} activeKey={category} onChange={setCategory} />
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
          </ScrollView>

          <View style={styles.actions}>
            <Button title="Annuller" variant="ghost" onPress={onClose} disabled={saving} />
            <Button
              title={saving ? 'Gemmer...' : 'Gem'}
              onPress={() => onSave({ title, lyrics, category })}
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
  },
});
