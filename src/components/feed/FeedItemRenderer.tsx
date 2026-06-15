import React from 'react';
import { Alert } from 'react-native';
import type { CommentPreview } from '../../services/likesApi';
import type { CategoryKey } from '../../theme/categories';
import type { FeedFanActivityData, FeedItem } from '../../types/feed';
import type { FanLevelKey } from '../../types/fan';
import { toEventCardVM } from '../../utils/eventCardVM';
import { recordRenderCount } from '../../utils/performanceTiming';
import { POST_ENGAGEMENT_TARGET_TYPE } from '../../utils/postEngagement';
import { PollCard } from '../PollCard';
import { FanActivityFeedCard } from '../fan/FanActivityFeedCard';
import { CommunityCard, FanPostCard, NewsCard, WeeklyTopFanCard } from '../cards';
import { EventCard } from '../cards/EventCard';

export type FeedItemRendererProps = {
  item: FeedItem;
  itemKey: string;
  user: any;
  isAppAdmin: boolean;
  likeState: { liked: boolean; likes: number };
  commentCount: number;
  commentPreviews: CommentPreview[];
  safeProfileMap: Record<
    string,
    { display_name: string | null; avatar_url: string | null; fan_level_key: FanLevelKey | null }
  >;
  communityMap: Record<string, string>;
  attendanceMap?: Record<string, { count: number; avatars: string[]; isGoing: boolean }>;
  toggleLike: (kind: any, id: string, userId: string) => void;
  removePost: (postId: string) => void;
  removeNews: (newsId: string) => void;
  incrementCommentCount: (kind: any, id: string) => void;
  addCommentPreview: (kind: any, id: string, comment: CommentPreview) => void;
  onPressEvent?: (eventId: string) => void;
  onPressBusTrip?: (busTripId: string) => void;
  onPressMatch?: (matchId: string) => void;
  onPressFanActivity?: (item: FeedFanActivityData) => void;
  onPressCommunity?: (communityId: string, title: string) => void;
  onPressProfile?: (userId: string) => void;
  onPressPost?: (postId: string) => void;
  /** Whether this specific item is the currently active inline video. */
  isActiveVideo?: boolean;
};

function FeedItemRendererComponent(props: FeedItemRendererProps): React.ReactElement | null {
  const {
    item,
    itemKey,
    user,
    isAppAdmin,
    likeState,
    commentCount,
    commentPreviews,
    safeProfileMap,
    communityMap,
    attendanceMap,
    toggleLike,
    removePost,
    removeNews,
    incrementCommentCount,
    addCommentPreview,
    onPressEvent,
    onPressBusTrip,
    onPressMatch,
    onPressFanActivity,
    onPressCommunity,
    onPressProfile,
    onPressPost,
    isActiveVideo,
  } = props;
  recordRenderCount('FeedItemRenderer', itemKey);

  switch (item.kind) {
    case 'post': {
      const authorProfile = item.data.authorId
        ? safeProfileMap[item.data.authorId] || {
            display_name: item.data.authorDisplayName ?? item.data.authorName ?? null,
            avatar_url: item.data.authorAvatarUrl ?? null,
            fan_level_key: null,
          }
        : undefined;
      const categoryKey: CategoryKey = 'fan';
      const pollData = item.data.poll_data;

      return (
        <FanPostCard
          key={itemKey}
          post={item.data}
          authorProfile={authorProfile}
          communityMap={communityMap}
          profileMap={safeProfileMap}
          categoryKey={categoryKey}
          currentUserId={user?.id}
          currentIsAppAdmin={isAppAdmin}
          liked={likeState.liked}
          likes={likeState.likes}
          commentsCount={commentCount}
          commentPreviews={commentPreviews}
          onToggleLike={() => {
            if (user?.id) {
              toggleLike(POST_ENGAGEMENT_TARGET_TYPE, item.id, user.id);
            }
          }}
          onDeleted={(postId) => removePost(postId)}
          onNewComment={(comment) => {
            incrementCommentCount(POST_ENGAGEMENT_TARGET_TYPE, item.id);
            addCommentPreview(POST_ENGAGEMENT_TARGET_TYPE, item.id, comment);
          }}
          isActiveVideo={isActiveVideo}
          bodyContent={
            pollData ? (
              <PollCard pollData={pollData} postId={item.id} profileMap={safeProfileMap} />
            ) : undefined
          }
        />
      );
    }

    case 'news': {
      const newsCommentPreviews = commentPreviews || [];
      return (
        <NewsCard
          key={itemKey}
          newsItem={item.data}
          currentUserId={user?.id}
          currentIsAppAdmin={isAppAdmin}
          userAvatarUrl={user?.user_metadata?.avatar_url}
          communityMap={communityMap || {}}
          profileMap={safeProfileMap}
          categoryKey="news"
          liked={likeState.liked}
          likes={likeState.likes}
          commentsCount={commentCount}
          onToggleLike={() => {
            if (user?.id) {
              toggleLike('news', item.id, user.id);
            }
          }}
          onPressShare={() => Alert.alert('Info', 'Del-funktionen kommer snart')}
          commentPreviews={newsCommentPreviews}
          onDeleted={(newsId) => removeNews(newsId)}
          onNewComment={(comment) => {
            incrementCommentCount('news', item.id);
            addCommentPreview('news', item.id, comment);
          }}
        />
      );
    }

    case 'weekly_top_fan': {
      return (
        <WeeklyTopFanCard
          avatarUrl={item.data.avatarUrl}
          displayName={item.data.displayName}
          fanLevelKey={item.data.fanLevelKey}
          weekStartDate={item.data.weekStartDate}
          title={item.data.title}
          subtitle={item.data.subtitle}
          body={item.data.body}
          ctaLabel={item.data.ctaLabel}
          contentTypeLabel={item.data.contentTypeLabel}
          highlightText={item.data.highlightText}
          likesCount={item.data.likesCount}
          commentsCount={item.data.commentsCount}
          votesCount={item.data.votesCount}
          onPressProfile={() => onPressProfile?.(item.data.userId)}
          onPressReference={
            item.data.referencePostId ? () => onPressPost?.(item.data.referencePostId!) : undefined
          }
        />
      );
    }

    case 'community': {
      return (
        <CommunityCard
          name={item.data.name}
          description={item.data.description}
          avatarUrl={item.data.avatarUrl}
          coverUrl={item.data.coverUrl}
          onPressJoin={() => onPressCommunity?.(item.data.communityId, item.data.name)}
        />
      );
    }

    case 'fan_activity': {
      return (
        <FanActivityFeedCard
          item={item.data}
          onPress={onPressFanActivity ? () => onPressFanActivity(item.data) : undefined}
        />
      );
    }

    case 'event':
    case 'bus_trip':
    case 'match': {
      const vm = toEventCardVM(item, {
        communityMap,
        profileMap: safeProfileMap,
        attendanceMap,
      });

      if (!vm) return null;

      const handleDetail = () => {
        if (item.kind === 'bus_trip') onPressBusTrip?.(item.id);
        else if (item.kind === 'match') onPressMatch?.(item.id);
        else onPressEvent?.(item.id);
      };

      return (
        <EventCard
          key={itemKey}
          vm={vm}
          liked={likeState.liked}
          likes={likeState.likes}
          comments={commentCount}
          onToggleLike={() => {
            if (user?.id) {
              toggleLike(item.kind, item.id, user.id);
            }
          }}
          onPressShare={() => Alert.alert('Info', 'Del-funktionen kommer snart')}
          onPressDetail={handleDetail}
          commentPreviews={commentPreviews}
          onNewComment={(comment) => {
            incrementCommentCount(item.kind, item.id);
            addCommentPreview(item.kind, item.id, comment);
          }}
        />
      );
    }

    default:
      return null;
  }
}

export const FeedItemRenderer = React.memo(FeedItemRendererComponent);
FeedItemRenderer.displayName = 'FeedItemRenderer';
