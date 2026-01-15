import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';
import { MediaAsset, pickCameraPhoto, pickCameraVideo, pickFromLibrary } from '../lib/mediaPicker';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (asset: MediaAsset) => void;
};

export default function CreateActionSheet({ visible, onClose, onPicked }: Props) {
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
              <Ionicons name="camera" size={22} color={colors.fcnRed} />
              <Text style={styles.actionText}>Tag billede</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => handlePick(pickCameraVideo)}>
              <Ionicons name="videocam" size={22} color={colors.fcnRed} />
              <Text style={styles.actionText}>Optag video</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => handlePick(pickFromLibrary)}>
              <Ionicons name="images" size={22} color={colors.fcnRed} />
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  actionText: {
    marginLeft: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  cancel: {
    marginTop: spacing.md,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cancelText: {
    color: colors.subtext,
    fontSize: 14,
  },
});
