import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActionSheetIOS,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

export interface OptionsMenuOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface OptionsMenuProps {
  options: OptionsMenuOption[];
  iconColor?: string;
  iconSize?: number;
}

/**
 * A 3-dot menu component that shows edit/delete actions.
 * Uses ActionSheetIOS on iOS and a custom modal on Android.
 */
export function OptionsMenu({ options, iconColor = colors.subtext, iconSize = 20 }: OptionsMenuProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const handlePress = () => {
    if (Platform.OS === 'ios') {
      // Use native iOS ActionSheet
      const optionLabels = options.map((opt) => opt.label);
      const destructiveIndex = options.findIndex((opt) => opt.destructive);
      const cancelButtonIndex = optionLabels.length;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...optionLabels, 'Annuller'],
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex < optionLabels.length) {
            const option = options[buttonIndex];
            // If destructive, show confirmation
            if (option.destructive) {
              Alert.alert('Bekræft', 'Er du sikker?', [
                { text: 'Annuller', style: 'cancel' },
                { text: option.label, style: 'destructive', onPress: option.onPress },
              ]);
            } else {
              option.onPress();
            }
          }
        },
      );
    } else {
      // Use custom modal on Android
      setModalVisible(true);
    }
  };

  const handleOptionPress = (option: OptionsMenuOption) => {
    setModalVisible(false);
    if (option.destructive) {
      Alert.alert('Bekræft', 'Er du sikker?', [
        { text: 'Annuller', style: 'cancel' },
        { text: option.label, style: 'destructive', onPress: option.onPress },
      ]);
    } else {
      option.onPress();
    }
  };

  return (
    <>
      <TouchableOpacity onPress={handlePress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="ellipsis-horizontal" size={iconSize} color={iconColor} />
      </TouchableOpacity>

      {/* Android Modal */}
      {Platform.OS === 'android' && (
        <Modal
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
            <View style={styles.modalContent}>
              {options.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.modalOption}
                  onPress={() => handleOptionPress(option)}
                >
                  {option.icon && (
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={option.destructive ? colors.error : colors.text}
                      style={styles.modalOptionIcon}
                    />
                  )}
                  <Text
                    style={[styles.modalOptionText, option.destructive && styles.modalOptionTextDestructive]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Annuller</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  modalOptionIcon: {
    marginRight: spacing.sm,
  },
  modalOptionText: {
    fontSize: 16,
    color: colors.text,
  },
  modalOptionTextDestructive: {
    color: colors.error,
  },
  modalCancel: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancelText: {
    fontSize: 16,
    color: colors.subtext,
    textAlign: 'center',
  },
});
