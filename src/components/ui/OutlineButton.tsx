import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from "../../theme";

interface OutlineButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: string;
}

export function OutlineButton({ title, onPress, disabled = false, icon }: OutlineButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      {icon && <Ionicons name={icon as any} size={16} color={colors.fcnRed} style={styles.icon} />}
      <Text style={styles.txt}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.fcnRed,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    alignItems: "center",
    flexDirection: "row",
  },
  icon: {
    marginRight: 8,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  txt: { color: colors.fcnRed, fontSize: 16, fontWeight: "700" }
});