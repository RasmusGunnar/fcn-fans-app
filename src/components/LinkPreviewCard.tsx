import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Theme, useTheme } from '../theme';
import type { PostLinkPreview } from '../types/post';
import { getLinkProviderLabel } from '../utils/linkPreview';
import { Text } from './ui';

interface LinkPreviewCardProps {
  preview: PostLinkPreview;
  mode?: 'composer' | 'feed';
  loading?: boolean;
  error?: string | null;
  onPress?: (event?: GestureResponderEvent) => void;
  onRemove?: () => void;
  style?: StyleProp<ViewStyle>;
}

function getLinkIconName(preview: PostLinkPreview): keyof typeof Ionicons.glyphMap {
  if (preview.provider === 'instagram') {
    return 'logo-instagram';
  }

  if (preview.provider === 'facebook') {
    return 'logo-facebook';
  }

  if (preview.domain.includes('youtube.com') || preview.domain.includes('youtu.be')) {
    return 'logo-youtube';
  }

  return 'link-outline';
}

function getFallbackTitle(preview: PostLinkPreview): string {
  if (preview.provider === 'instagram') {
    return 'Instagram-link';
  }

  if (preview.provider === 'facebook') {
    return 'Facebook-link';
  }

  return 'Link-preview';
}

export function LinkPreviewCard({
  preview,
  mode = 'feed',
  loading = false,
  error = null,
  onPress,
  onRemove,
  style,
}: LinkPreviewCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [preview.imageUrl]);

  const providerLabel = getLinkProviderLabel(preview);
  const fallbackTitle = getFallbackTitle(preview);
  const title = preview.title?.trim() || fallbackTitle;
  const domainLabel =
    preview.domain && providerLabel.toLowerCase() !== preview.domain.toLowerCase()
      ? preview.domain
      : null;
  const secondaryLine =
    preview.description?.trim() ||
    domainLabel ||
    (preview.siteName?.trim() &&
    preview.siteName.trim().toLowerCase() !== title.toLowerCase()
      ? preview.siteName.trim()
      : preview.url);
  const showImage = Boolean(preview.imageUrl) && !imageFailed;
  const iconName = getLinkIconName(preview);

  const content = (
    <View style={[styles.card, mode === 'composer' ? styles.cardComposer : null, style]}>
      <View style={[styles.mediaSlot, !showImage ? styles.mediaSlotCompact : null]}>
        {showImage ? (
          <Image
            source={{ uri: preview.imageUrl! }}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={styles.iconWrap}>
            <Ionicons
              name={iconName}
              size={theme.components.icon.size.md}
              color={theme.colors.text.secondary}
            />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={styles.providerPill}>
            <Text variant="caption" color="primary" style={styles.providerPillText}>
              {providerLabel}
            </Text>
          </View>
          {domainLabel ? (
            <Text variant="caption" color="muted" numberOfLines={1} style={styles.domainText}>
              {domainLabel}
            </Text>
          ) : null}
        </View>

        <Text variant="bodyBold" color="primary" numberOfLines={2}>
          {title}
        </Text>

        {secondaryLine ? (
          <Text variant="small" color="secondary" numberOfLines={2}>
            {secondaryLine}
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={theme.colors.text.secondary} />
            <Text variant="caption" color="secondary">
              Henter preview...
            </Text>
          </View>
        ) : null}

        {!loading && error ? (
          <Text variant="caption" color="secondary">
            Metadata mangler. Linket deles stadig som opslag.
          </Text>
        ) : null}
      </View>

      {mode === 'composer' && onRemove ? (
        <Pressable
          style={styles.removeButton}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Fjern link-preview"
          hitSlop={theme.spacing[2]}
        >
          <Ionicons
            name="close"
            size={theme.components.icon.size.sm}
            color={theme.colors.text.secondary}
          />
        </Pressable>
      ) : onPress ? (
        <View style={styles.actionIconWrap}>
          <Ionicons
            name="open-outline"
            size={theme.components.icon.size.sm}
            color={theme.colors.text.secondary}
          />
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      style={({ pressed }) => [pressed ? styles.cardPressed : null]}
      onPress={(event) => onPress(event)}
      accessibilityRole="link"
      accessibilityLabel={`Åbn ${providerLabel}-link eksternt`}
    >
      {content}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      padding: theme.spacing[3],
      borderRadius: theme.radius.md,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.surface,
    },
    cardComposer: {
      backgroundColor: theme.colors.bg.card,
    },
    cardPressed: {
      opacity: 0.9,
    },
    mediaSlot: {
      width: theme.spacing[16],
      height: theme.spacing[16],
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.subtle,
      flexShrink: 0,
    },
    mediaSlotCompact: {
      width: theme.spacing[12],
      height: theme.spacing[12],
      borderRadius: theme.radius.md,
    },
    thumbnail: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.colors.bg.subtle,
    },
    iconWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.subtle,
      borderRadius: theme.radius.md,
    },
    body: {
      flex: 1,
      minWidth: 0,
      gap: theme.spacing[1],
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      minWidth: 0,
    },
    providerPill: {
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      flexShrink: 0,
    },
    providerPillText: {
      fontWeight: '600',
    },
    domainText: {
      flex: 1,
      minWidth: 0,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      marginTop: theme.spacing[1],
    },
    actionIconWrap: {
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    removeButton: {
      alignSelf: 'flex-start',
      width: theme.spacing[8],
      height: theme.spacing[8],
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: theme.layout.borderHairline,
      borderColor: theme.colors.border.subtle,
      flexShrink: 0,
    },
  });
}
