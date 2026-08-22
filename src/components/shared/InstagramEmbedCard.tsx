import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useInstagramEmbed } from '../../hooks/useInstagramEmbed';
import { useTheme, type Theme } from '../../theme';
import type { SharedLinkAttachment } from '../../types/externalShare';
import { getInstagramEmbedUiState } from '../../utils/instagramEmbed';
import { Text } from '../ui';
import { InstagramCard } from './InstagramCard';
import { InstagramEmbedRenderer } from './InstagramEmbedRenderer';
import { InstagramOpenButton } from './InstagramOpenButton';

type InstagramEmbedCardProps = {
  attachment: SharedLinkAttachment;
  enabled?: boolean;
  onRemove?: () => void;
};

export function InstagramEmbedCard({
  attachment,
  enabled = true,
  onRemove,
}: InstagramEmbedCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const request = useInstagramEmbed(attachment, enabled);
  const [rendererFailed, setRendererFailed] = useState(false);

  useEffect(() => setRendererFailed(false), [attachment.canonicalUrl]);

  const uiState = rendererFailed ? 'fallback' : getInstagramEmbedUiState(enabled, request.status);
  if (uiState === 'placeholder') {
    return <InstagramCard attachment={attachment} onRemove={onRemove} />;
  }
  if (uiState === 'loading') {
    return (
      <View style={styles.loadingCard} accessibilityLabel="Henter Instagram-indhold">
        <View style={styles.loadingHeader}>
          <Ionicons name="logo-instagram" size={24} color={theme.colors.primary} />
          <Text variant="bodyBold">Instagram</Text>
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
        <View style={styles.loadingBody}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text variant="small" color="secondary">
            Henter officielt Instagram-indhold…
          </Text>
        </View>
        <InstagramOpenButton canonicalUrl={attachment.canonicalUrl} />
      </View>
    );
  }
  if (uiState === 'ready' && request.status === 'ready') {
    return (
      <View style={styles.readyCard}>
        <InstagramEmbedRenderer embed={request.embed} onFailure={() => setRendererFailed(true)} />
        <InstagramOpenButton canonicalUrl={request.embed.canonicalUrl} />
      </View>
    );
  }
  return <InstagramCard attachment={attachment} onRemove={onRemove} unavailable />;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    readyCard: { gap: theme.spacing[3] },
    loadingCard: {
      gap: theme.spacing[4],
      minHeight: theme.spacing[16] * 2,
      padding: theme.spacing[4],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.card,
    },
    loadingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
    },
    loadingBody: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[3],
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
    },
    removeButton: {
      marginLeft: 'auto',
      width: theme.spacing[8],
      height: theme.spacing[8],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
    },
  });
}
