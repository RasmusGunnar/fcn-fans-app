import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseInstagramUrl } from '../../lib/instagram';
import { useTheme, type Theme } from '../../theme';
import type { SharedLinkAttachment } from '../../types/externalShare';
import { Text } from '../ui';
import { InstagramEmbedCard } from './InstagramEmbedCard';

type InstagramEmbedModalProps = {
  attachment: SharedLinkAttachment | null;
  visible: boolean;
  onClose: () => void;
};

export function InstagramEmbedModal({ attachment, visible, onClose }: InstagramEmbedModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const openInstagram = () => {
    const parsed = attachment ? parseInstagramUrl(attachment.canonicalUrl) : null;
    if (parsed) void Linking.openURL(parsed.canonicalUrl).catch(() => undefined);
  };

  return (
    <Modal visible={visible && Boolean(attachment)} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Luk Instagram-visning"
          >
            <Ionicons name="close" size={24} color={theme.colors.text.primary} />
          </Pressable>
          <Text variant="h3" style={styles.title}>
            Instagram
          </Text>
          <Pressable
            onPress={openInstagram}
            style={styles.headerButton}
            accessibilityRole="link"
            accessibilityLabel="Åbn på Instagram"
          >
            <Ionicons name="open-outline" size={22} color={theme.colors.primary} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {attachment ? <InstagramEmbedCard attachment={attachment} enabled={visible} /> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.colors.bg.default },
    header: {
      minHeight: theme.spacing[12],
      paddingHorizontal: theme.spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: theme.layout.borderWidth,
      borderBottomColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    headerButton: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
    },
    title: { flex: 1, textAlign: 'center' },
    content: { padding: theme.layout.screenPadding, paddingBottom: theme.spacing[16] },
  });
}
