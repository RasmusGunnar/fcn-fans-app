import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import type { StadiumReactionType } from '../../types/stadiumLive';
import { STADIUM_REACTION_OPTIONS } from '../../utils/stadiumLive';
import { Text } from '../ui';

type Props = {
  visible: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSelect: (reactionType: StadiumReactionType) => void;
};

export function StadiumReactionPicker({ visible, disabled, onClose, onSelect }: Props) {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <Text variant="h3">Send en stadionreaktion</Text>
          <View style={styles.grid}>
            {STADIUM_REACTION_OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                accessibilityRole="button"
                accessibilityLabel={`Send ${option.label}`}
                disabled={disabled}
                onPress={() => onSelect(option.type)}
                style={({ pressed }) => [
                  styles.option,
                  pressed && !disabled ? styles.optionPressed : null,
                  disabled ? styles.optionDisabled : null,
                ]}
              >
                <Text style={styles.emoji}>{option.emoji}</Text>
                <Text variant="small" style={styles.optionLabel} numberOfLines={1}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay.heavy,
    },
    sheet: {
      backgroundColor: theme.colors.bg.card,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[4],
      paddingBottom: theme.spacing[8],
      gap: theme.spacing[3],
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing[2],
    },
    option: {
      width: '31%',
      minHeight: theme.spacing[16],
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[1],
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.surface,
    },
    optionPressed: {
      opacity: 0.75,
      transform: [{ scale: 0.98 }],
    },
    optionDisabled: { opacity: 0.45 },
    emoji: { fontSize: theme.spacing[7] },
    optionLabel: { fontWeight: '700' },
  });
