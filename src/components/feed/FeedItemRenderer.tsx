import React from 'react';
import { Alert } from 'react-native';
import type { CommentPreview } from '../../services/likesApi';
import type { CategoryKey } from '../../theme/categories';
import type { FeedItem } from '../../types/feed';
import { toEventCardVM } from '../../utils/eventCardVM';
import { EventCard } from '../cards/EventCard';
import { FanPostCard, NewsCard } from '../cards';

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
  isActiveVideo?: boolean;
  isAppActive?: boolean;
  onActivateVideo?: () => void;
  onPressEvent?: (eventId: string) => void;
  onPressBusTrip?: (busTripId: string) => void;
  onPressMatch?: (matchId: string) => void;
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
  isActiveVideo,
  isAppActive,
  onActivateVideo,
  onPressEvent,
  onPressBusTrip,
  onPressMatch,
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
          isActiveVideo={isActiveVideo}
          isAppActive={isAppActive}
          onActivateVideo={onActivateVideo}
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
    case 'match': {
      const vm = toEventCardVM(item, { communityMap, profileMap: safeProfileMap });
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
          onPressShare={() => {}}
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
