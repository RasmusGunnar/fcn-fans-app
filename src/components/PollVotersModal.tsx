import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import type { ProfileMap } from '../utils/actor';
import { Avatar } from './Avatar';
import { Text } from './ui/Text';

interface PollVotersModalProps {
  visible: boolean;
  onClose: () => void;
  voterIds: string[];
  voterProfiles?: ProfileMap;
}

export function PollVotersModal({ visible, onClose, voterIds, voterProfiles }: PollVotersModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text variant="bodyBold" style={styles.title}>
              Stemmer
            </Text>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {voterIds.map((voterId) => (
              <View key={voterId} style={styles.row}>
                <Avatar
                  userId={voterId}
                  avatarUrl={voterProfiles?.[voterId]?.avatar_url}
                  size={36}
                  label={voterProfiles?.[voterId]?.display_name || 'Fan'}
                />

                <Text variant="body" style={styles.userText}>
                  {voterProfiles?.[voterId]?.display_name || 'Fan'}
                </Text>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text variant="body" style={styles.closeButtonText}>
              Luk
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay.medium,
    },
    backdrop: {
      flex: 1,
    },
    sheet: {
      maxHeight: '75%',
      backgroundColor: theme.colors.bg.card,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      padding: theme.spacing[4],
      gap: theme.spacing[3],
    },
    header: {
      paddingBottom: theme.spacing[2],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.default,
    },
    title: {
      color: theme.colors.text.primary,
      fontWeight: '700',
    },
    body: {
      flexGrow: 0,
    },
    bodyContent: {
      gap: theme.spacing[2],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      paddingVertical: theme.spacing[2],
    },
    userText: {
      color: theme.colors.text.primary,
      fontWeight: '600',
    },
    closeButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    closeButtonText: {
      color: theme.colors.text.primary,
      fontWeight: '600',
    },
  });
}
