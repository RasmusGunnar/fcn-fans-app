// DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { useCommunityRole } from '../../hooks/useCommunityRole';
import { getSafeFanLevelKey } from '../../lib/fanLevel';
import { logger } from '../../lib/logger';
import { supabase } from '../../lib/supabase';
import type { CommentPreview } from '../../services/likesApi';
import { defaultTheme } from '../../theme';
import type { CategoryKey } from '../../theme/categories';
import { NewsItem } from '../../types/news';
import { canDeleteFeedItem } from '../../utils/permissions';
import { resolveActorLine, type ProfileMap } from '../../utils/actor';
import { sanitizeNewsHeroImageUrl } from '../../utils/newsMedia';
import { cleanText } from '../../utils/text';
import { Avatar } from '../Avatar';
import { FanLevelBadge } from '../fan/FanLevelBadge';
import { OptionsMenu, OptionsMenuOption } from '../OptionsMenu';
import { Text } from '../ui';
import { buildCardBehaviorModel } from './cardBehaviorModel';
import { CardHeader } from './CardHeader';
import { CardMedia } from './CardMedia';
import { CardRoot } from './CardRoot';

function getTimeAgo(isoDate: string): string {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'lige nu';
  if (diffMins < 60) return `For ${diffMins} minut${diffMins > 1 ? 'ter' : ''} siden`;
  if (diffHours < 24) return `For ${diffHours} time${diffHours > 1 ? 'r' : ''} siden`;
  if (diffDays < 7) return `For ${diffDays} dag${diffDays > 1 ? 'e' : ''} siden`;
  return date.toLocaleDateString('da-DK');
}

function getDomainLabel(
  url: string | null | undefined,
  options: { stripWww?: boolean } = {},
): string | null {
  const cleanedUrl = cleanText(url).trim();
  if (!cleanedUrl) return null;

  try {
    const hostname = new URL(cleanedUrl).hostname || '';
    const stripWww = options.stripWww ?? true;
    return stripWww ? hostname.replace(/^www\./i, '') || null : hostname || null;
  } catch {
    return null;
  }
}

function getLinkIconName(url: string | null | undefined): keyof typeof Ionicons.glyphMap {
  const domain = getDomainLabel(url)?.toLowerCase() || '';

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

interface NewsCardProps {
  newsItem: NewsItem;
  currentUserId?: string;
  currentIsAppAdmin?: boolean;
  userAvatarUrl?: string;
  communityMap?: Record<string, string>;
  profileMap?: ProfileMap;
  categoryKey?: CategoryKey;
  liked?: boolean;
  likes?: number;
  commentsCount?: number;
  onToggleLike?: () => void;
  onPressComment?: () => void;
  onPressShare?: () => void;
  commentPreviews?: CommentPreview[];
  onNewComment?: (comment: CommentPreview) => void;
  onDeleted?: (newsId: string) => void;
}

export function NewsCard({
  newsItem,
  currentUserId,
  currentIsAppAdmin,
  userAvatarUrl,
  communityMap = {},
  profileMap,
  categoryKey = 'news',
  liked = newsItem.likedByMe,
  likes = newsItem.likesCount,
  commentsCount = newsItem.commentsCount,
  onToggleLike = () => {},
  onPressComment = () => {},
  onPressShare = () => {},
  commentPreviews = [],
  onNewComment,
  onDeleted = () => {},
}: NewsCardProps) {
  const navigation = useNavigation<any>();
  const { user, isAppAdmin } = useAuth();
  const viewerUserId = currentUserId ?? user?.id;
  const viewerIsAppAdmin = currentIsAppAdmin ?? isAppAdmin;
  const timeAgo = getTimeAgo(newsItem.createdAt);
  const newsCreatedBy = newsItem.createdBy ?? (newsItem as any).created_by ?? null;
  const newsActorType = newsItem.actorType ?? (newsItem as any).actor_type ?? 'user';
  const newsActorId = newsItem.actorId ?? (newsItem as any).actor_id ?? newsCreatedBy;
  const newsCommunityId = newsItem.communityId ?? (newsItem as any).community_id ?? null;
  const cleanedSiteName = cleanText(newsItem.siteName);
  const cleanedTitle = cleanText(newsItem.title);
  const cleanedDescription = cleanText(newsItem.description);
  const cleanedNote = cleanText(newsItem.note);
  const linkDomain = useMemo(() => getDomainLabel(newsItem.url), [newsItem.url]);
  const fullLinkDomain = useMemo(
    () => getDomainLabel(newsItem.url, { stripWww: false }),
    [newsItem.url],
  );
  const heroImageUrl = useMemo(
    () => sanitizeNewsHeroImageUrl(newsItem.imageUrl, newsItem.url),
    [newsItem.imageUrl, newsItem.url],
  );
  const authoredCommunityId =
    newsActorType === 'community' ? newsActorId || newsCommunityId || null : null;
  const { role: authoredCommunityRole } = useCommunityRole(authoredCommunityId);
  const [imageFailed, setImageFailed] = useState(false);

  const resolvedActor = resolveActorLine({
    actorType: newsActorType,
    authorId: newsActorType === 'user' ? newsActorId || newsCreatedBy || undefined : undefined,
    authorEmail: newsItem.actorName || undefined,
    profileMap,
    communityName: newsActorType === 'community' ? communityMap[newsActorId] : undefined,
  });
  const authorName = resolvedActor.displayName;

  const actorUserId = newsActorType === 'user' ? newsActorId || newsCreatedBy : newsCreatedBy;
  const actorProfile = profileMap?.[actorUserId];
  const actorFanLevel =
    newsActorType === 'user' && actorProfile?.fan_level_key
      ? getSafeFanLevelKey(actorProfile.fan_level_key)
      : null;
  const resolvedAvatarUrl =
    actorProfile?.avatar_url ??
    (currentUserId === newsCreatedBy ? userAvatarUrl : undefined) ??
    undefined;

  const handleOpenLink = () => {
    Linking.openURL(newsItem.url).catch((err) => {
      logger.warn('[NewsCard] Failed to open URL:', err);
    });
  };

  const showDeleteOption = canDeleteFeedItem({
    isAppAdmin: viewerIsAppAdmin,
    viewerUserId,
    itemAuthorId: newsCreatedBy ?? undefined,
    itemActorType: newsActorType,
    itemCommunityRole: authoredCommunityRole,
  });

  const handleDeleteNews = async () => {
    const { error } = await supabase.from('news_items').delete().eq('id', newsItem.id);
    if (error) {
      Alert.alert('Fejl', 'Kunne ikke slette nyheden');
      logger.warn('Delete news error', error);
    } else {
      onDeleted(newsItem.id);
    }
  };

  const newsMenuOptions: OptionsMenuOption[] = [];
  if (showDeleteOption) {
    newsMenuOptions.push({
      label: 'Slet',
      onPress: handleDeleteNews,
      destructive: true,
      icon: 'trash-outline',
    });
  }

  const theme = defaultTheme;

  const cardModel = buildCardBehaviorModel({
    kind: 'news',
    actorType: newsActorType === 'community' ? 'community' : 'fan',
    actorName: authorName,
    newsUrl: newsItem.url,
  });

  const hasRightSlot = newsMenuOptions.length > 0;
  const showHeroImage = Boolean(heroImageUrl) && !imageFailed;
  const mediaLabel = cleanedSiteName || linkDomain || 'Nyhed';
  const compactPrimaryLabel = cleanedSiteName || cleanedTitle || linkDomain || 'Link';
  const compactSecondaryLabel =
    fullLinkDomain && fullLinkDomain.toLowerCase() !== compactPrimaryLabel.toLowerCase()
      ? fullLinkDomain
      : cleanedSiteName
        ? cleanedTitle || cleanedDescription || null
        : cleanedDescription || null;
  const compactIconName = getLinkIconName(newsItem.url);
  const ctaLabel = '\u00c5bn';

  useEffect(() => {
    setImageFailed(false);
  }, [heroImageUrl]);

  return (
    <CardRoot
      targetType="news"
      targetId={newsItem.id || newsItem.url}
      currentUserId={viewerUserId}
      isAppAdmin={viewerIsAppAdmin}
      onOpenDetail={
        cardModel.pressBehavior === 'open_external'
          ? () => Linking.openURL(cardModel.externalUrl!)
          : undefined
      }
      actions={{
        liked,
        likes,
        comments: commentsCount,
        onToggleLike,
        onPressShare,
      }}
      commentPreviews={commentPreviews}
      onNewComment={onNewComment}
      profileMap={profileMap}
    >
      <CardHeader
        avatarSlot={
          <Avatar userId={actorUserId} avatarUrl={resolvedAvatarUrl} size={40} label={authorName} />
        }
        nameLine={cardModel.nameLine}
        fallbackTitle={authorName}
        subtitle={timeAgo}
        inlineBadge={<FanLevelBadge level={actorFanLevel} size="sm" labelMode="short" />}
        onPressAuthor={
          actorUserId
            ? () => navigation.navigate('PublicProfile', { userId: actorUserId })
            : undefined
        }
        rightSlot={hasRightSlot ? <OptionsMenu options={newsMenuOptions} /> : undefined}
      />

      {cleanedNote && cleanedNote.trim() ? (
        <View style={styles.noteBlock}>
          <Text variant="body" color="primary" numberOfLines={4} ellipsizeMode="tail">
            {cleanedNote}
          </Text>
        </View>
      ) : null}

      {showHeroImage ? (
        <>
          <CardMedia aspectRatio={16 / 9} fullBleed style={{ marginTop: theme.spacing[3] }}>
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
            {cleanedTitle ? (
              <Text variant="bodyBold" color="primary" style={styles.title} numberOfLines={2}>
                {cleanedTitle}
              </Text>
            ) : null}
            {cleanedDescription ? (
              <Text variant="body" color="secondary" style={styles.description} numberOfLines={3}>
                {cleanedDescription}
              </Text>
            ) : null}
            {newsItem.url ? (
              <Pressable style={styles.ctaButton} onPress={handleOpenLink}>
                <Text variant="body" color="primary" style={styles.ctaText}>
                  {ctaLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : (
        <View style={styles.linkContentCompact}>
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
          {newsItem.url ? (
            <Pressable style={styles.ctaButtonCompact} onPress={handleOpenLink}>
              <Text variant="small" color="primary" style={styles.ctaTextCompact}>
                {ctaLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </CardRoot>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.border.default,
  },
  noteBlock: {
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
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
