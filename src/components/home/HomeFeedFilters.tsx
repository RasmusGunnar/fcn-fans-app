import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import type { HomeFeedFilter } from '../../utils/homeFeedFilter';

const OPTIONS: { value: HomeFeedFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'fan_posts', label: 'Fan Posts' },
  { value: 'media_articles', label: 'FCN i medierne' },
];

export function HomeFeedFilters({
  value,
  onChange,
}: {
  value: HomeFeedFilter;
  onChange: (value: HomeFeedFilter) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.filters} accessibilityRole="tablist" accessibilityLabel="Filtrér feed">
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: selected ? theme.colors.pill.red.bg : theme.colors.bg.card,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: selected ? theme.colors.primaryDark : theme.colors.text.secondary,
                  fontWeight: selected ? '700' : '500',
                },
              ]}
            >
              {option.label}
            </Text>
            {selected ? (
              <View style={[styles.activeMark, { backgroundColor: theme.colors.primaryDark }]} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  tab: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, lineHeight: 17 },
  activeMark: {
    position: 'absolute',
    bottom: 5,
    alignSelf: 'center',
    width: 12,
    height: 2,
    borderRadius: 1,
  },
});
