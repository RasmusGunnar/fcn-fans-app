import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useInstagramEmbed } from '../../hooks/useInstagramEmbed';
import { useTheme, type Theme } from '../../theme';
import type { SharedLinkAttachment } from '../../types/externalShare';
import {
  getInstagramEmbedReservedHeight,
  getInstagramEmbedUiState,
  rememberInstagramEmbedHeight,
  resolveInstagramEmbedFrameHeight,
} from '../../utils/instagramEmbed';
import { Text } from '../ui';
import { InstagramCard } from './InstagramCard';
import { InstagramEmbedRenderer } from './InstagramEmbedRenderer';
import { InstagramOpenButton } from './InstagramOpenButton';

type InstagramEmbedCardProps = {
  attachment: SharedLinkAttachment;
  enabled?: boolean;
  /** Locks feed placeholder, rich content and fallback to one outer height. */
  fixedHeight?: number;
  onRemove?: () => void;
};

export function InstagramEmbedCard({
  attachment,
  enabled = true,
  fixedHeight,
  onRemove,
}: InstagramEmbedCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const request = useInstagramEmbed(attachment, enabled);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [geometry, setGeometry] = useState(() => ({
    canonicalUrl: attachment.canonicalUrl,
    height: getInstagramEmbedReservedHeight(attachment.canonicalUrl),
  }));

  useEffect(() => setRendererFailed(false), [attachment.canonicalUrl]);
  useEffect(() => {
    const height = getInstagramEmbedReservedHeight(attachment.canonicalUrl);
    setGeometry((current) =>
      current.canonicalUrl === attachment.canonicalUrl && current.height === height
        ? current
        : { canonicalUrl: attachment.canonicalUrl, height },
    );
  }, [attachment.canonicalUrl]);

  const handleHeightChange = useCallback(
    (measuredHeight: number) => {
      if (fixedHeight !== undefined) return;
      const height = rememberInstagramEmbedHeight(attachment.canonicalUrl, measuredHeight);
      setGeometry((current) =>
        current.canonicalUrl === attachment.canonicalUrl && current.height === height
          ? current
          : { canonicalUrl: attachment.canonicalUrl, height },
      );
    },
    [attachment.canonicalUrl, fixedHeight],
  );
  const handleRendererFailure = useCallback(() => setRendererFailed(true), []);

  const uiState = rendererFailed ? 'fallback' : getInstagramEmbedUiState(enabled, request.status);
  const measuredHeight =
    geometry.canonicalUrl === attachment.canonicalUrl
      ? geometry.height
      : getInstagramEmbedReservedHeight(attachment.canonicalUrl);
  const reservedHeight =
    fixedHeight === undefined
      ? measuredHeight
      : resolveInstagramEmbedFrameHeight(attachment.canonicalUrl, fixedHeight);

  let frameContent: React.ReactNode;
  if (uiState === 'placeholder') {
    frameContent = (
      <InstagramCard
        attachment={attachment}
        onRemove={onRemove}
        showOpenButton={false}
        style={styles.stateCard}
      />
    );
  } else if (uiState === 'loading') {
    frameContent = (
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
      </View>
    );
  } else if (uiState === 'ready' && request.status === 'ready') {
    frameContent = (
      <InstagramEmbedRenderer
        embed={request.embed}
        onHeightChange={handleHeightChange}
        onFailure={handleRendererFailure}
      />
    );
  } else {
    frameContent = (
      <InstagramCard
        attachment={attachment}
        onRemove={onRemove}
        unavailable
        showOpenButton={false}
        style={styles.stateCard}
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.mediaFrame, { height: reservedHeight }]}>{frameContent}</View>
      <InstagramOpenButton canonicalUrl={attachment.canonicalUrl} />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    root: { gap: theme.spacing[3] },
    mediaFrame: {
      width: '100%',
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.card,
    },
    stateCard: { flex: 1 },
    loadingCard: {
      flex: 1,
      gap: theme.spacing[4],
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
