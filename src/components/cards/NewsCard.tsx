// DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
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
import { cleanText } from '../../utils/text';
import { Avatar } from '../Avatar';
import { FanLevelBadge } from '../fan/FanLevelBadge';
import { OptionsMenu, OptionsMenuOption } from '../OptionsMenu';
import { Text } from '../ui';
import { buildCardBehaviorModel } from './cardBehaviorModel';
import { ArticlePreview } from './ArticlePreview';
import { CardHeader } from './CardHeader';
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
  onPressShare,
  commentPreviews = [],
  onNewComment,
  onDeleted = () => {},
}: NewsCardProps) {
  const navigation = useNavigation<any>();
  const viewerUserId = currentUserId;
  const viewerIsAppAdmin = currentIsAppAdmin ?? false;
  const timeAgo = getTimeAgo(newsItem.createdAt);
  const newsCreatedBy = newsItem.createdBy ?? (newsItem as any).created_by ?? null;
  const newsActorType = newsItem.actorType ?? (newsItem as any).actor_type ?? 'user';
  const newsActorId = newsItem.actorId ?? (newsItem as any).actor_id ?? newsCreatedBy;
  const newsCommunityId = newsItem.communityId ?? (newsItem as any).community_id ?? null;
  const cleanedNote = cleanText(newsItem.note);
  const authoredCommunityId =
    newsActorType === 'community' ? newsActorId || newsCommunityId || null : null;
  const { role: authoredCommunityRole } = useCommunityRole(authoredCommunityId);
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

  const cardModel = buildCardBehaviorModel({
    kind: 'news',
    actorType: newsActorType === 'community' ? 'community' : 'fan',
    actorName: authorName,
    newsUrl: newsItem.url,
  });

  const hasRightSlot = newsMenuOptions.length > 0;
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
        inlineBadge={<FanLevelBadge level={actorFanLevel} size="sm" />}
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
      <ArticlePreview
        preview={{
          url: newsItem.url,
          title: newsItem.title,
          description: newsItem.description,
          imageUrl: newsItem.imageUrl,
          siteName: newsItem.siteName,
        }}
        fallbackLabel="Nyhed"
        onOpen={handleOpenLink}
      />
    </CardRoot>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  noteBlock: {
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
});
