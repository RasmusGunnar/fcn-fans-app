import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme, type Theme } from '../../theme';
import type { SharedLinkAttachment } from '../../types/externalShare';
import { getInstagramResourceLabel, parseInstagramUrl } from '../../lib/instagram';
import { Text } from '../ui';
import { InstagramOpenButton } from './InstagramOpenButton';

type InstagramCardProps = {
  attachment: SharedLinkAttachment;
  compact?: boolean;
  onRemove?: () => void;
  unavailable?: boolean;
};

export function InstagramCard({
  attachment,
  compact = false,
  onRemove,
  unavailable = false,
}: InstagramCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const validated = parseInstagramUrl(attachment.canonicalUrl);
  if (!validated) return null;

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <View style={styles.providerIcon}>
          <Ionicons name="logo-instagram" size={compact ? 20 : 24} color={theme.colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text variant="bodyBold">Instagram</Text>
          <Text variant="small" color="secondary">
            {getInstagramResourceLabel(validated.resourceType)}
          </Text>
        </View>
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            style={styles.removeButton}
            accessibilityRole="button"
            accessibilityLabel="Fjern Instagram-link"
          >
            <Ionicons name="close" size={20} color={theme.colors.text.secondary} />
          </Pressable>
        ) : null}
      </View>
      {!compact ? (
        <Text variant="small" color="muted" style={styles.notice}>
          {unavailable
            ? 'Indholdet er privat, slettet eller midlertidigt utilgængeligt.'
            : 'Brug knappen nedenfor for at åbne indholdet på Instagram.'}
        </Text>
      ) : null}
      <InstagramOpenButton canonicalUrl={validated.canonicalUrl} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      gap: theme.spacing[3],
      padding: theme.spacing[4],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.card,
    },
    cardCompact: {
      gap: theme.spacing[2],
      padding: theme.spacing[3],
      borderRadius: theme.radius.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
    },
    providerIcon: {
      width: theme.spacing[10],
      height: theme.spacing[10],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
    },
    copy: { flex: 1, minWidth: 0 },
    removeButton: {
      width: theme.spacing[8],
      height: theme.spacing[8],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
    },
    notice: { lineHeight: 18 },
  });
}
