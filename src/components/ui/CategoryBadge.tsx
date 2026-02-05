import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../../theme';
import { CATEGORIES, type CategoryKey } from '../../theme/categories';
import { Text } from './Text';

export type CategoryBadgeProps = {
  categoryKey: CategoryKey;
};

function resolveColorToken(theme: Theme, token?: string, componentName?: string): string {
  if (typeof token !== 'string' || token.trim().length === 0) {
    if (__DEV__) {
      console.warn('[resolveColorToken] Missing token', { componentName, token });
    }
    return theme.colors.text.primary;
  }
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
    label: 'Ukendt',
    solidBgToken: 'pill.neutral.bg',
    solidTextToken: 'pill.neutral.text',
    iconName: 'pricetag',
  };

  const bgColor = resolveColorToken(theme, definition.solidBgToken, 'CategoryBadge');
  const textColor = resolveColorToken(
    theme,
    definition.solidTextToken ?? 'text.onSolid',
    'CategoryBadge',
  );

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Ionicons name={definition.iconName as any} size={14} color={textColor} />
      <Text variant="small" color="primary" style={[styles.text, { color: textColor }]}>
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
      paddingHorizontal: theme.spacing[3],
      paddingVertical: theme.spacing[3] / 2,
      borderRadius: theme.radius.pill,
      alignSelf: 'flex-start',
      marginTop: theme.layout.borderHairline,
    },
    text: {
      fontWeight: '500',
      fontSize: 12,
    },
  });
}
