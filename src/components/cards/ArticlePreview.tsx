import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { defaultTheme } from '../../theme';
import type { LinkPreview } from '../../types/news';
import {
  getLinkPreviewDomain,
  isInstagramUrl,
  normalizeLinkPreview,
} from '../../utils/linkPreview';
import { sanitizeNewsHeroImageUrl } from '../../utils/newsMedia';
import { cleanText } from '../../utils/text';
import { Text } from '../ui';
import { CardMedia } from './CardMedia';

type ArticlePreviewProps = {
  preview: LinkPreview;
  fallbackLabel?: string;
  onOpen?: () => void;
};

function getLinkIconName(url: string | null | undefined): keyof typeof Ionicons.glyphMap {
  const domain = getLinkPreviewDomain(url)?.toLowerCase() || '';

  if (domain.includes('facebook.com') || domain === 'fb.watch') {
    return 'logo-facebook';
  }
  if (domain.includes('instagram.com')) {
    return 'logo-instagram';
  }
  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    return 'logo-youtube';
  }

  return 'link-outline';
}

export function ArticlePreview({
  preview,
  fallbackLabel = 'Artikel',
  onOpen,
}: ArticlePreviewProps) {
  const normalizedPreview = useMemo(() => normalizeLinkPreview(preview), [preview]);
  const [imageFailed, setImageFailed] = useState(false);
  const url = normalizedPreview?.url ?? '';
  const title = cleanText(normalizedPreview?.title);
  const description = cleanText(normalizedPreview?.description);
  const siteName = cleanText(normalizedPreview?.siteName);
  const domain = useMemo(() => getLinkPreviewDomain(url), [url]);
  const fullDomain = useMemo(() => getLinkPreviewDomain(url, { stripWww: false }), [url]);
  const instagramLink = useMemo(() => isInstagramUrl(url), [url]);
  const heroImageUrl = useMemo(
    () => (instagramLink ? null : sanitizeNewsHeroImageUrl(normalizedPreview?.imageUrl, url)),
    [instagramLink, normalizedPreview?.imageUrl, url],
  );

  useEffect(() => {
    setImageFailed(false);
  }, [heroImageUrl]);

  if (!normalizedPreview) {
    return null;
  }

  const handleOpen = () => {
    if (onOpen) {
      onOpen();
      return;
    }

    void Linking.openURL(normalizedPreview.url).catch(() => undefined);
  };

  const showHeroImage = Boolean(heroImageUrl) && !imageFailed;
  const mediaLabel = siteName || domain || fallbackLabel;
  const compactPrimaryLabel = siteName || title || domain || fallbackLabel;
  const compactSecondaryLabel =
    fullDomain && fullDomain.toLowerCase() !== compactPrimaryLabel.toLowerCase()
      ? fullDomain
      : siteName
        ? title || description || null
        : description || null;
  const compactIconName = getLinkIconName(url);

  if (!showHeroImage) {
    return (
      <Pressable
        style={styles.linkContentCompact}
        onPress={(event) => {
          event.stopPropagation();
          handleOpen();
        }}
        accessibilityRole="link"
      >
        <View style={styles.linkIconWrap}>
          <Ionicons
            name={compactIconName}
            size={theme.components.icon.size.md}
            color={theme.colors.text.secondary}
          />
        </View>
        <View style={styles.linkTextWrap}>
          <Text variant="bodyBold" color="primary" numberOfLines={1} style={styles.compactTitle}>
            {compactPrimaryLabel}
          </Text>
          {compactSecondaryLabel ? (
            <Text variant="small" color="secondary" numberOfLines={1} style={styles.compactMeta}>
              {compactSecondaryLabel}
            </Text>
          ) : null}
        </View>
        <View style={styles.ctaButtonCompact}>
          <Text variant="small" color="primary" style={styles.ctaTextCompact}>
            Åbn
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View>
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          handleOpen();
        }}
        accessibilityRole="link"
      >
        <CardMedia aspectRatio={16 / 9} fullBleed style={styles.heroMedia}>
          <Image
            source={{ uri: heroImageUrl! }}
            style={styles.mediaImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        </CardMedia>

        <View style={styles.linkContent}>
          <Text variant="small" color="secondary" style={styles.siteName}>
            {mediaLabel}
          </Text>
          {title ? (
            <Text variant="bodyBold" color="primary" style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {description ? (
            <Text variant="body" color="secondary" style={styles.description} numberOfLines={3}>
              {description}
            </Text>
          ) : null}
          <View style={styles.ctaButton}>
            <Text variant="body" color="primary" style={styles.ctaText}>
              Åbn
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  heroMedia: {
    marginTop: theme.spacing[3],
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.border.default,
  },
  linkContent: {
    gap: theme.spacing[1],
    marginTop: theme.spacing[3],
  },
  linkContentCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.sm,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.bg.surface,
  },
  linkIconWrap: {
    width: theme.spacing[10],
    height: theme.spacing[10],
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg.subtle,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.subtle,
    flexShrink: 0,
  },
  linkTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[0],
  },
  siteName: {
    textTransform: 'uppercase',
  },
  title: {},
  description: {},
  compactTitle: {
    fontWeight: '600',
  },
  compactMeta: {
    color: theme.colors.text.muted,
  },
  ctaButton: {
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[3],
    borderWidth: theme.layout.borderWidth,
    borderColor: theme.colors.state.success,
    backgroundColor: theme.colors.bg.card,
    paddingVertical: theme.spacing[2] + theme.spacing[1] / 2,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.pill,
    alignItems: 'center',
  },
  ctaButtonCompact: {
    alignSelf: 'center',
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.sm,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.bg.subtle,
    flexShrink: 0,
  },
  ctaText: {
    color: theme.colors.state.success,
    textAlign: 'center',
    fontWeight: '600',
  },
  ctaTextCompact: {
    color: theme.colors.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
