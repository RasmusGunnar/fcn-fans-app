import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Theme } from '../../theme';
import { CATEGORIES, type CategoryKey } from '../../theme/categories';
import { Text } from './Text';

export type ListRowProps = {
  accent: CategoryKey;
  icon: string;
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
};

function resolveColorToken(theme: Theme, token: string): string {
  const parts = token.split('.');
  let current: any = theme.colors;
  for (const part of parts) {
    current = current?.[part];
  }
  return typeof current === 'string' ? current : theme.colors.brand.accent;
}

export function ListRow({ accent, icon, title, subtitle, meta, onPress }: ListRowProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const definition = CATEGORIES[accent] || {
    key: accent,
    label: String(accent),
    colorToken: 'brand.accent',
    iconName: 'pricetag',
  };

  const accentColor = resolveColorToken(theme, definition.colorToken);

  const Container = onPress ? Pressable : View;
  const containerProps = onPress ? { onPress } : {};

  return (
    <Container style={styles.container} {...containerProps}>
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon as any} size={theme.components.icon.size.md} color={accentColor} />
        </View>
        <View style={styles.textBlock}>
          <Text variant="h3" color="primary" style={styles.title}>
            {title}
          </Text>
          {!!subtitle && (
            <Text variant="body" color="secondary" style={styles.subtitle}>
              {subtitle}
            </Text>
          )}
        </View>
        {!!meta && (
          <Text variant="small" color="secondary" style={styles.meta}>
            {meta}
          </Text>
        )}
      </View>
    </Container>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.colors.bg.card,
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.default,
      overflow: 'hidden',
      marginBottom: theme.spacing[3],
    },
    accentBar: {
      height: '100%',
      width: theme.spacing[1],
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[4],
      paddingHorizontal: theme.spacing[4],
      gap: theme.spacing[3],
    },
    iconWrap: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textBlock: {
      flex: 1,
    },
    title: {
      color: theme.colors.text.primary,
    },
    subtitle: {
      marginTop: theme.spacing[1],
    },
    meta: {
      color: theme.colors.text.secondary,
    },
  });
}
