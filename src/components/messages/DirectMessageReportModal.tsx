import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DirectMessageReportReason } from '../../types/messages';
import { useTheme, type Theme } from '../../theme';
import { Button, Text } from '../ui';

const REASONS: { value: DirectMessageReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'abuse', label: 'Krænkende indhold' },
  { value: 'harassment', label: 'Chikane' },
  { value: 'personal_info', label: 'Personlige oplysninger' },
  { value: 'other', label: 'Andet' },
];

type DirectMessageReportModalProps = {
  visible: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: DirectMessageReportReason, note: string) => void;
};

export function DirectMessageReportModal({
  visible,
  submitting,
  onClose,
  onSubmit,
}: DirectMessageReportModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<DirectMessageReportReason>('spam');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setReason('spam');
      setNote('');
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
          <Text variant="h3">Rapportér samtale</Text>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Luk rapportering"
          >
            <Ionicons name="close" size={24} color={theme.colors.text.primary} />
          </Pressable>
        </View>
        <View style={styles.content}>
          <Text variant="body" color="secondary">
            Vælg en grund. Beskederne kopieres ikke til rapporten.
          </Text>
          <View style={styles.reasons}>
            {REASONS.map((item) => {
              const selected = reason === item.value;
              return (
                <Pressable
                  key={item.value}
                  style={styles.reasonRow}
                  onPress={() => setReason(item.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? theme.colors.primary : theme.colors.text.secondary}
                  />
                  <Text variant="body">{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Tilføj en note (valgfrit)"
            placeholderTextColor={theme.colors.text.muted}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
          {submitting ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Button title="Send rapport" onPress={() => onSubmit(reason, note)} fullWidth />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    header: {
      paddingHorizontal: theme.layout.screenPadding,
      paddingBottom: theme.spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.default,
    },
    closeButton: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
      padding: theme.layout.screenPadding,
      gap: theme.spacing[4],
    },
    reasons: {
      gap: theme.spacing[1],
    },
    reasonRow: {
      minHeight: theme.spacing[11],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      borderBottomWidth: theme.layout.borderHairline,
      borderBottomColor: theme.colors.border.subtle,
    },
    noteInput: {
      minHeight: theme.spacing[16] * 2,
      padding: theme.spacing[3],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.card,
      color: theme.colors.text.primary,
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
    },
  });
}
