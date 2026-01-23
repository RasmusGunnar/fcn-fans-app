import React from 'react';
import { View, Text, StyleSheet, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { FeedCardShell } from '../feed/FeedCardShell';
import { FeedCardHeader } from '../FeedCardHeader';
import { colors, spacing } from '../../theme';
import { NewsItem } from '../../types/news';
import { useAuth } from '../../auth/AuthProvider';
import type { CommentPreview } from '../../services/likesApi';

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
  liked?: boolean;
  commentsCount?: number; // Comment count from commentCountMap
  onToggleLike?: () => void;
  onPressComment?: () => void;
  onPressShare?: () => void;
  commentPreviews?: CommentPreview[];
  onNewComment?: (comment: CommentPreview) => void;
}

export function NewsCard({
  newsItem,
  currentUserId,
  userAvatarUrl,
  communityMap = {},
  liked = newsItem.likedByMe,
  commentsCount = newsItem.commentsCount,
  onToggleLike = () => {},
  onPressComment = () => {},
  onPressShare = () => {},
  commentPreviews = [],
  onNewComment,
}: NewsCardProps) {
  const { user, isAppAdmin } = useAuth();
  const timeAgo = getTimeAgo(newsItem.createdAt);

  // Determine author name based on actor type and available data
  let authorName: string;

  if (newsItem.actorType === 'community' && newsItem.actorId) {
    // Try to get community name from communityMap
    authorName = communityMap[newsItem.actorId] || `${newsItem.actorId.slice(0, 6)}…`;
  } else if (currentUserId && newsItem.createdBy === currentUserId) {
    // Own post
    authorName = 'Dig';
  } else if (newsItem.actorName && newsItem.actorName !== 'Ukendt') {
    // Use actorName if available and not "Ukendt"
    authorName = newsItem.actorName;
  } else {
    // Fallback to truncated UUID
    authorName = `${newsItem.createdBy.slice(0, 6)}…`;
  }

  const isOwnPost = currentUserId && newsItem.createdBy === currentUserId;
  const avatarSource = isOwnPost && userAvatarUrl ? { uri: userAvatarUrl } : null;

  const handleOpenLink = () => {
    Linking.openURL(newsItem.url).catch((err) => {
      console.warn('[NewsCard] Failed to open URL:', err);
    });
  };

  return (
    <FeedCardShell
      targetType="news"
      targetId={newsItem.id || newsItem.url}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      onOpenDetail={handleOpenLink}
      actions={{
        liked,
        likes: newsItem.likesCount,
        comments: commentsCount,
        onToggleLike,
        onPressShare,
      }}
      commentPreviews={commentPreviews}
      onNewComment={onNewComment}
    >
      <Pill label="Nyhed" />
      <FeedCardHeader
        avatarSlot={
          <View style={styles.avatar}>
            {avatarSource ? (
              <Image source={avatarSource} style={styles.avatarImage} />
            ) : (
              <Ionicons
                name={newsItem.actorType === 'user' ? 'person' : 'people'}
                size={20}
                color={colors.card}
              />
            )}
          </View>
        }
        title={authorName}
        subtitle={timeAgo}
      />

      <View style={styles.linkCard}>
        {newsItem.imageUrl && (
          <Image source={{ uri: newsItem.imageUrl }} style={styles.image} resizeMode="cover" />
        )}
        <View style={styles.linkContent}>
          {newsItem.siteName && <Text style={styles.siteName}>{newsItem.siteName}</Text>}
          {newsItem.title && (
            <Text style={styles.title} numberOfLines={2}>
              {newsItem.title}
            </Text>
          )}
          {newsItem.description && (
            <Text style={styles.description} numberOfLines={3}>
              {newsItem.description}
            </Text>
          )}
          <View style={styles.linkIndicator}>
            <Ionicons name="open-outline" size={14} color={colors.fcnRed} />
            <Text style={styles.linkText}>Åbn link</Text>
          </View>
        </View>
      </View>
    </FeedCardShell>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
  },
  linkCard: {
    backgroundColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  image: {
    width: '100%',
    height: 180,
    backgroundColor: colors.border,
  },
  linkContent: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  siteName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.subtext,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    fontSize: 14,
    color: colors.subtext,
    lineHeight: 20,
  },
  linkIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.fcnRed,
  },
});
