// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';
import type { CommentPreview } from '../../services/likesApi';
import { defaultTheme } from '../../theme';
import type { CategoryKey } from '../../theme/categories';
import { NewsItem } from '../../types/news';
import { resolveActorLine, type ProfileMap } from '../../utils/actor';
import { canDeleteFeedItem } from '../../utils/permissions';
import { Avatar } from '../Avatar';
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

interface NewsCardProps {
  newsItem: NewsItem;
  currentUserId?: string; // Current user ID to check if news is own
  userAvatarUrl?: string; // Current user's avatar URL
  communityMap?: Record<string, string>; // Map of community ID -> name
  profileMap?: ProfileMap;
  categoryKey?: CategoryKey;
  liked?: boolean;
  likes?: number;
  commentsCount?: number; // Comment count from commentCountMap
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
  const timeAgo = getTimeAgo(newsItem.createdAt);

  const resolvedActor = resolveActorLine({
    actorType: newsItem.actorType,
    authorId: newsItem.actorType === 'user' ? newsItem.actorId || newsItem.createdBy : undefined,
    authorEmail: newsItem.actorName || undefined,
    profileMap,
    communityName: newsItem.actorType === 'community' ? communityMap[newsItem.actorId] : undefined,
  });
  const authorName = resolvedActor.displayName;

  // Resolve avatar URL: prefer profileMap lookup for the actor, fall back to current user's avatar
  const actorUserId =
    newsItem.actorType === 'user' ? newsItem.actorId || newsItem.createdBy : newsItem.createdBy;
  const actorProfile = profileMap?.[actorUserId];
  const resolvedAvatarUrl =
    actorProfile?.avatar_url ??
    (currentUserId === newsItem.createdBy ? userAvatarUrl : undefined) ??
    undefined;

  const handleOpenLink = () => {
    Linking.openURL(newsItem.url).catch((err) => {
      console.warn('[NewsCard] Failed to open URL:', err);
    });
  };

  const showDeleteOption = canDeleteFeedItem({
    isAppAdmin,
    viewerUserId: user?.id,
    itemAuthorId: newsItem.createdBy,
    itemActorType: newsItem.actorType,
    itemCommunityRole: null,
  });

  const handleDeleteNews = async () => {
    const { error } = await supabase.from('news_items').delete().eq('id', newsItem.id);
    if (error) {
      Alert.alert('Fejl', 'Kunne ikke slette nyheden');
      console.warn('Delete news error', error);
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

  // Build card behavior model
  const cardModel = buildCardBehaviorModel({
    kind: 'news',
    actorType: newsItem.actorType === 'community' ? 'community' : 'fan',
    actorName: authorName,
    newsUrl: newsItem.url,
  });

  return (
    <CardRoot
      targetType="news"
      targetId={newsItem.id || newsItem.url}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
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
    >
      <CardHeader
        avatarSlot={
          <Avatar userId={actorUserId} avatarUrl={resolvedAvatarUrl} size={40} label={authorName} />
        }
        nameLine={cardModel.nameLine}
        fallbackTitle={authorName}
        subtitle={timeAgo}
        onPressAuthor={
          actorUserId
            ? () => navigation.navigate('PublicProfile', { userId: actorUserId })
            : undefined
        }
        rightSlot={
          showDeleteOption && newsMenuOptions.length > 0 ? (
            <OptionsMenu options={newsMenuOptions} />
          ) : undefined
        }
      />

      {newsItem.imageUrl ? (
        <CardMedia aspectRatio={16 / 9} fullBleed style={{ marginTop: theme.spacing[3] }}>
          {__DEV__ &&
            (console.log('[NewsCard:Image]', {
              id: newsItem.id,
              source: { uri: newsItem.imageUrl },
              typeof: typeof newsItem.imageUrl,
            }),
            null)}
          <Image source={{ uri: newsItem.imageUrl }} style={styles.mediaImage} resizeMode="cover" />
        </CardMedia>
      ) : null}

      <View style={styles.linkContent}>
        {newsItem.siteName && (
          <Text variant="small" color="secondary" style={styles.siteName}>
            {newsItem.siteName}
          </Text>
        )}
        {newsItem.title && (
          <Text variant="bodyBold" color="primary" style={styles.title} numberOfLines={2}>
            {newsItem.title}
          </Text>
        )}
        {newsItem.description && (
          <Text variant="body" color="secondary" style={styles.description} numberOfLines={3}>
            {newsItem.description}
          </Text>
        )}
        {newsItem.url ? (
          <Pressable style={styles.ctaButton} onPress={handleOpenLink}>
            <Text variant="body" color="primary" style={styles.ctaText}>
              Læs artikel
            </Text>
          </Pressable>
        ) : null}
      </View>
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
  linkContent: {
    gap: theme.spacing[1],
    marginTop: theme.spacing[3],
  },
  siteName: {
    textTransform: 'uppercase',
  },
  title: {},
  description: {},

  ctaButton: {
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[3],
    borderWidth: theme.layout.borderWidth,
    borderColor: theme.colors.state.success,
    backgroundColor: 'transparent',
    paddingVertical: theme.spacing[2] + theme.spacing[1] / 2,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.pill,
    alignItems: 'center',
  },
  ctaText: {
    color: theme.colors.state.success,
    textAlign: 'center',
    fontWeight: '600',
  },
});
