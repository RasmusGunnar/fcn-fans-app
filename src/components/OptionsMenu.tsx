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
import { useTheme, Theme } from '../theme';

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
export function OptionsMenu({ options, iconColor, iconSize = 20 }: OptionsMenuProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const resolvedIconColor = iconColor ?? theme.colors.text.secondary;
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
      <TouchableOpacity
        onPress={handlePress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="ellipsis-horizontal" size={iconSize} color={resolvedIconColor} />
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
                      color={option.destructive ? theme.colors.error : theme.colors.text.primary}
                      style={styles.modalOptionIcon}
                    />
                  )}
                  <Text
                    style={[
                      styles.modalOptionText,
                      option.destructive && styles.modalOptionTextDestructive,
                    ]}
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

function createStyles(theme: Theme) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay.heavy,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.colors.bg.card,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingTop: theme.spacing[4],
      paddingBottom: theme.spacing[6],
    },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[4],
      paddingHorizontal: theme.spacing[6],
    },
    modalOptionIcon: {
      marginRight: theme.spacing[2],
    },
    modalOptionText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.primary,
    },
    modalOptionTextDestructive: {
      color: theme.colors.error,
    },
    modalCancel: {
      marginTop: theme.spacing[2],
      paddingVertical: theme.spacing[4],
      paddingHorizontal: theme.spacing[6],
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.default,
    },
    modalCancelText: {
      fontSize: theme.typography.body.fontSize,
      color: theme.colors.text.secondary,
      textAlign: 'center',
    },
  });
}
