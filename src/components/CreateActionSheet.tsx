import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../theme';
import { MediaAsset, pickCameraPhoto, pickCameraVideo, pickFromLibrary } from '../lib/mediaPicker';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (asset: MediaAsset) => void;
};

export default function CreateActionSheet({ visible, onClose, onPicked }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const handlePick = async (fn: () => Promise<MediaAsset | null>) => {
    try {
      const asset = await fn();
      if (asset) {
        onClose();
        onPicked(asset);
      }
    } catch (e) {
      console.warn('Pick error', e);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Opret opslag</Text>
          <View style={styles.actions}>
            <Pressable style={styles.action} onPress={() => handlePick(pickCameraPhoto)}>
              <Ionicons name="camera" size={22} color={theme.colors.primary} />
              <Text style={styles.actionText}>Tag billede</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => handlePick(pickCameraVideo)}>
              <Ionicons name="videocam" size={22} color={theme.colors.primary} />
              <Text style={styles.actionText}>Optag video</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => handlePick(pickFromLibrary)}>
              <Ionicons name="images" size={22} color={theme.colors.primary} />
              <Text style={styles.actionText}>Vælg fra bibliotek</Text>
            </Pressable>
          </View>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Annullér</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: Theme) {
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
      backgroundColor: theme.colors.bg.card,
      padding: theme.spacing[4],
      borderTopLeftRadius: theme.radius.md,
      borderTopRightRadius: theme.radius.md,
    },
    title: {
      fontSize: theme.typography.h3.fontSize,
      fontWeight: theme.typography.h3.fontWeight as any,
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[4],
    },
    actions: {
      gap: theme.spacing[2],
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[2],
    },
    actionText: {
      marginLeft: theme.spacing[2],
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.primary,
    },
    cancel: {
      marginTop: theme.spacing[4],
      alignSelf: 'center',
      paddingVertical: theme.spacing[2],
      paddingHorizontal: theme.spacing[6],
    },
    cancelText: {
      color: theme.colors.text.secondary,
      fontSize: theme.typography.body.fontSize,
    },
  });
}
