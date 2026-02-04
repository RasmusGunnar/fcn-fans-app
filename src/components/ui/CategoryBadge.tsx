import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../../theme';
import { CATEGORIES, type CategoryKey } from '../../theme/categories';
import { Text } from './Text';

export type CategoryBadgeProps = {
  categoryKey: CategoryKey;
};

function resolveColorToken(theme: Theme, token: string): string {
  const parts = token.split('.');
  let current: any = theme.colors;
  for (const part of parts) {
    current = current?.[part];
  }
  return typeof current === 'string' ? current : theme.colors.brand.accent;
}

export function CategoryBadge({ categoryKey }: CategoryBadgeProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const definition = CATEGORIES[categoryKey] || {
    key: categoryKey,
    label: String(categoryKey),
    colorToken: 'brand.accent',
    iconName: 'pricetag',
  };

  const bgColor = resolveColorToken(theme, definition.colorToken);
  const textColor = theme.colors.text.inverse;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Ionicons name={definition.iconName as any} size={14} color={textColor} />
      <Text variant="small" color="inverse" style={styles.text}>
        {definition.label}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
      paddingHorizontal: theme.components.pill.px,
      paddingVertical: theme.components.pill.py,
      borderRadius: theme.components.pill.radius,
      alignSelf: 'flex-start',
    },
    text: {
      fontWeight: '600',
    },
  });
}
