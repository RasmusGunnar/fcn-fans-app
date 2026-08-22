import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { parseInstagramUrl } from '../../lib/instagram';
import { openInstagramFromExplicitCta } from '../../services/instagramExternalNavigation';
import { useTheme, type Theme } from '../../theme';
import { Text } from '../ui';

type InstagramOpenButtonProps = {
  canonicalUrl: string;
};

export function InstagramOpenButton({ canonicalUrl }: InstagramOpenButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const validated = parseInstagramUrl(canonicalUrl);
  if (!validated) return null;

  return (
    <Pressable
      onPress={() => {
        void openInstagramFromExplicitCta(validated.canonicalUrl).catch(() => undefined);
      }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel="Åbn på Instagram"
    >
      <Text variant="small" style={styles.label}>
        Åbn på Instagram
      </Text>
      <Ionicons name="open-outline" size={16} color={theme.colors.primary} />
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    button: {
      minHeight: theme.spacing[10],
      paddingHorizontal: theme.spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[2],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
    },
    pressed: { opacity: 0.8 },
    label: { color: theme.colors.primary, fontWeight: '700' },
  });
}
