import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";

export function PrimaryButton(props: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.btn,
        props.disabled && styles.disabled,
        pressed && !props.disabled && styles.pressed
      ]}
    >
      <Text style={styles.txt}>{props.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center"
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  txt: { fontSize: 16, fontWeight: "600" }
});
