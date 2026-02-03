import React from 'react';
import { Alert } from 'react-native';
import type { CommentPreview } from '../../services/likesApi';
import type { FeedItem } from '../../types/feed';
import { FanPostCard, NewsCard, EventCard } from '../cards';

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
  incrementCommentCount: (kind: any, id: string) => void;
  addCommentPreview: (kind: any, id: string, comment: CommentPreview) => void;
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
  incrementCommentCount,
  addCommentPreview,
}: FeedItemRendererProps) {
  switch (item.kind) {
    case 'post': {
      const authorProfile = item.data.authorId ? safeProfileMap[item.data.authorId] : undefined;
      return (
        <FanPostCard
          key={itemKey}
          post={item.data}
          authorProfile={authorProfile}
          communityMap={communityMap}
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
          liked={likeState.liked}
          commentsCount={commentCount}
          onToggleLike={() => {
            if (user?.id) {
              toggleLike('news', item.id, user.id);
            }
          }}
          onPressShare={() => Alert.alert('Info', 'Del-funktionen kommer snart')}
          commentPreviews={newsCommentPreviews}
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
          date={item.data.startAt ?? ''}
          location={item.data.location ?? ''}
          spotsLeft={0}
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

    default:
      return null;
  }
}
