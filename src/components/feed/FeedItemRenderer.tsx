import React from 'react';
import { Alert } from 'react-native';
import type { CommentPreview } from '../../services/likesApi';
import type { FeedItem } from '../../types/feed';
import { FanPostCard, NewsCard, EventCard } from '../cards';
import { MatchCard } from '../events/MatchCard';
import type { CategoryKey } from '../../theme/categories';

export type FeedItemRendererProps = {
  item: FeedItem;
  itemKey: string;
  user: any;
  isAppAdmin: boolean;
  likeState: { liked: boolean; likes: number };
  commentCount: number;
  commentPreviews: CommentPreview[];
  safeProfileMap: Record<string, { display_name: string | null; avatar_url: string | null }>;
  communityMap: Record<string, string>;
  toggleLike: (kind: any, id: string, userId: string) => void;
  removePost: (postId: string) => void;
  removeNews: (newsId: string) => void;
  incrementCommentCount: (kind: any, id: string) => void;
  addCommentPreview: (kind: any, id: string, comment: CommentPreview) => void;
  onPressEvent?: (eventId: string) => void;
  onPressBusTrip?: (busTripId: string) => void;
  onPressMatch?: (matchId: string) => void;
  isActiveVideo?: boolean;
};

export function FeedItemRenderer({
  item,
  itemKey,
  user,
  isAppAdmin,
  likeState,
  commentCount,
  commentPreviews,
  safeProfileMap,
  communityMap,
  toggleLike,
  removePost,
  removeNews,
  incrementCommentCount,
  addCommentPreview,
  onPressEvent,
  onPressBusTrip,
  onPressMatch,
  isActiveVideo = false,
}: FeedItemRendererProps) {
  switch (item.kind) {
    case 'post': {
      const authorProfile = item.data.authorId ? safeProfileMap[item.data.authorId] : undefined;
      const categoryKey: CategoryKey = 'fan';
      return (
        <FanPostCard
          key={itemKey}
          post={item.data}
          authorProfile={authorProfile}
          communityMap={communityMap}
          profileMap={safeProfileMap}
          categoryKey={categoryKey}
          liked={likeState.liked}
          likes={likeState.likes}
          commentsCount={commentCount}
          commentPreviews={commentPreviews}
          onToggleLike={() => {
            if (user?.id) {
              toggleLike('post', item.id, user.id);
            }
          }}
          onDeleted={(postId) => removePost(postId)}
          onNewComment={(comment) => {
            incrementCommentCount('post', item.id);
            addCommentPreview('post', item.id, comment);
          }}
          isActiveVideo={isActiveVideo}
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

    case 'event':
    case 'bus_trip':
      return (
        <EventCard
          key={itemKey}
          eventId={item.id}
          title={item.data.title}
          description={item.data.description ?? null}
          date={item.data.startAt ?? ''}
          location={item.data.location ?? ''}
          spotsLeft={0}
          categoryKey={item.kind === 'bus_trip' ? 'bus_trip' : 'event'}
          profileMap={safeProfileMap}
          communityMap={communityMap}
          organizerType={item.data.organizerType ?? null}
          organizerId={item.data.organizerId ?? null}
          liked={likeState.liked}
          likes={likeState.likes}
          comments={commentCount}
          onToggleLike={() => {
            if (user?.id) {
              toggleLike(item.kind, item.id, user.id);
            }
          }}
          onPressComment={() => {}}
          onPressShare={() => {}}
          onPressDetail={
            item.kind === 'bus_trip'
              ? onPressBusTrip
                ? () => onPressBusTrip(item.id)
                : undefined
              : onPressEvent
                ? () => onPressEvent(item.id)
                : undefined
          }
          communityName={item.data.organizerName ?? null}
          communityId={item.data.organizerGroupId ?? null}
          eventType={item.kind === 'bus_trip' ? 'bustur' : 'event'}
          targetType={item.kind}
          commentPreviews={commentPreviews}
          onNewComment={(comment) => {
            incrementCommentCount(item.kind, item.id);
            addCommentPreview(item.kind, item.id, comment);
          }}
        />
      );

    case 'match':
      return (
        <MatchCard
          matchId={item.id}
          home={item.data.home ?? ''}
          away={item.data.away ?? ''}
          homeLogo={item.data.homeLogo ?? null}
          awayLogo={item.data.awayLogo ?? null}
          kickoffAt={item.data.kickoffAt ?? ''}
          venue={item.data.venue ?? null}
          venueCity={item.data.venueCity ?? null}
          competition={item.data.competition ?? null}
          round={item.data.round ?? null}
          profileMap={safeProfileMap}
          onPress={onPressMatch ? () => onPressMatch(item.id) : () => {}}
          liked={likeState.liked}
          likes={likeState.likes}
          comments={commentCount}
          onToggleLike={() => {
            if (user?.id) {
              toggleLike('match', item.id, user.id);
            }
          }}
        />
      );

    default:
      return null;
  }
}
