import React from 'react';
import { View, Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { defaultTheme } from '../../theme';

const theme = defaultTheme;

interface SegmentedControlItem<Key extends string> {
  key: Key;
  label: string;
}

export interface SegmentedControlProps<Key extends string> {
  items: ReadonlyArray<SegmentedControlItem<Key>>;
  activeKey: Key;
  onChange: (key: Key) => void;
  style?: ViewStyle;
}

export function SegmentedControl<Key extends string>({
  items,
  activeKey,
  onChange,
  style,
}: SegmentedControlProps<Key>) {
  return (
    <View style={[styles.railContainer, style]}>
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={[styles.button, isActive && styles.buttonActive]}
          >
            <Text style={[styles.text, isActive && styles.textActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  railContainer: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.bg.subtle,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing[4],
    marginVertical: theme.spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  button: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.pill,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: theme.colors.brand.accent,
  },
  text: {
    color: theme.colors.text.secondary,
    ...theme.typography.caption,
  },
  textActive: {
    color: theme.colors.text.inverse,
    ...theme.typography.caption,
  },
});
