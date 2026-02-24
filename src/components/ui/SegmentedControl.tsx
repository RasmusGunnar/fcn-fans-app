import React from 'react';
import { View, Pressable, Text, StyleSheet, ViewStyle, ScrollView } from 'react-native';
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.railContent}
      >
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(item.key)}
              style={[styles.button, isActive && styles.buttonActive]}
            >
              <Text
                style={[styles.text, isActive && styles.textActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  railContainer: {
    height: theme.spacing[10],
    backgroundColor: theme.colors.bg.subtle,
    borderRadius: theme.radius.pill,
    marginVertical: theme.spacing[2],
    overflow: 'hidden',
    alignItems: 'center',
  },
  scrollView: {
    flexGrow: 0,
  },
  railContent: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    gap: theme.spacing[1],
  },
  button: {
    height: theme.spacing[8],
    paddingHorizontal: theme.spacing[2],
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
    ...theme.typography.small,
  },
  textActive: {
    color: theme.colors.text.inverse,
    ...theme.typography.small,
  },
});
