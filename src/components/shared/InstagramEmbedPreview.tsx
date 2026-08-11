import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useInstagramEmbed } from '../../hooks/useInstagramEmbed';
import { parseInstagramUrl } from '../../lib/instagram';
import { useTheme, type Theme } from '../../theme';
import type { SharedLinkAttachment } from '../../types/externalShare';
import { getInstagramResourceLabel } from '../../lib/instagram';
import { Text } from '../ui';

type InstagramEmbedPreviewProps = {
  attachment: SharedLinkAttachment;
  onPress?: () => void;
  onRemove?: () => void;
};

export function InstagramEmbedPreview({
  attachment,
  onPress,
  onRemove,
}: InstagramEmbedPreviewProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const request = useInstagramEmbed(attachment);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const thumbnailUrl =
    request.status === 'ready' && !thumbnailFailed ? request.embed.thumbnailUrl : undefined;

  useEffect(() => setThumbnailFailed(false), [attachment.canonicalUrl]);

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    const parsed = parseInstagramUrl(attachment.canonicalUrl);
    if (parsed) void Linking.openURL(parsed.canonicalUrl).catch(() => undefined);
  };

  const secondaryCopy =
    request.status === 'ready' && request.embed.authorName
      ? request.embed.authorName
      : request.status === 'unavailable' || request.status === 'error'
        ? 'Privat eller ikke tilgængeligt'
        : getInstagramResourceLabel(attachment.resourceType);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.preview, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Vis Instagram-indhold"
      >
        <View style={styles.thumbnail}>
          {thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              style={styles.thumbnailImage}
              resizeMode="cover"
              onError={() => setThumbnailFailed(true)}
            />
          ) : request.status === 'loading' ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Ionicons name="logo-instagram" size={28} color={theme.colors.primary} />
          )}
        </View>
        <View style={styles.copy}>
          <Text variant="bodyBold">Instagram</Text>
          <Text variant="small" color="secondary" numberOfLines={1}>
            {secondaryCopy}
          </Text>
        </View>
        {!onRemove ? (
          <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
        ) : null}
      </Pressable>
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
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { position: 'relative' },
    preview: {
      minHeight: theme.spacing[14],
      padding: theme.spacing[2],
      paddingRight: theme.spacing[10],
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[3],
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.card,
    },
    pressed: { opacity: 0.8 },
    thumbnail: {
      width: theme.spacing[12],
      height: theme.spacing[12],
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.bg.subtle,
    },
    thumbnailImage: { width: '100%', height: '100%' },
    copy: { flex: 1, minWidth: 0 },
    removeButton: {
      position: 'absolute',
      top: theme.spacing[3],
      right: theme.spacing[2],
      width: theme.spacing[8],
      height: theme.spacing[8],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.card,
    },
  });
}
