import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { AppHeader } from '../components/AppHeader';
import { FanPostCard } from '../components/cards/FanPostCard';
import { Text } from '../components/ui';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { useFeed } from '../state/FeedContext';
import { useTheme, type Theme } from '../theme';
import { normalizePostType, type Post } from '../types/post';
import { extractHashtags } from '../utils/extractHashtags';
import { resolveAvatarUrl } from '../utils/avatar';
import { normalizeLinkPreview } from '../utils/linkPreview';
import { normalizeMedia } from '../utils/media';
import { getPostEngagementIdentity, POST_ENGAGEMENT_TARGET_TYPE } from '../utils/postEngagement';

type HashtagPostRow = {
  id: string;
  created_at: string;
  author_id: string | null;
  actor_type: 'user' | 'community' | null;
  actor_id: string | null;
  text: string | null;
  media: unknown;
  community_id: string | null;
  feed_targets: string[] | null;
  poll_data: Post['poll_data'];
  link_preview: unknown;
  post_type: unknown;
};

type HashtagCommentRow = {
  target_id: string | null;
  text: string | null;
};

type HashtagCommunityIdentity = {
  name: string;
  avatarUrl: string | null;
};

const HASHTAG_POST_SELECT =
  'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets, poll_data, link_preview, post_type';

function normalizeTag(value: string | undefined): string {
  return (value ?? '').replace('#', '').trim().toLowerCase();
}

export default function HashtagScreen() {
  const route = useRoute() as any;
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, isAppAdmin } = useAuth();
  const {
    posts,
    profileMap,
    communityMap,
    likeMap,
    commentCountMap,
    commentPreviewMap,
    toggleLike,
    incrementCommentCount,
    addCommentPreview,
    removePost,
  } = useFeed();
  const tag = normalizeTag(route?.params?.tag);
  const [taggedPosts, setTaggedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cachedPostsById = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);

  const logHashtagQueryError = useCallback(
    (
      scope: string,
      queryError: {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
      },
    ) => {
      logger.error(`[HashtagScreen] ${scope} failed`, {
        tag,
        code: queryError.code,
        message: queryError.message,
        details: queryError.details,
        hint: queryError.hint,
      });
    },
    [tag],
  );

  const mapRowToPost = useCallback(
    (
      row: HashtagPostRow,
      communityIdentityMap: ReadonlyMap<string, HashtagCommunityIdentity>,
    ): Post | null => {
      if (!row.id) {
        return null;
      }

      const actorCommunityId =
        row.actor_type === 'community' ? (row.actor_id ?? row.community_id) : null;
      const communityIdentity = actorCommunityId
        ? communityIdentityMap.get(actorCommunityId)
        : undefined;
      const cachedPost = cachedPostsById.get(row.id);
      if (cachedPost) {
        return cachedPost.actorType === 'community'
          ? {
              ...cachedPost,
              actorDisplayName: communityIdentity?.name ?? cachedPost.actorDisplayName,
              actorAvatarUrl: communityIdentity?.avatarUrl ?? cachedPost.actorAvatarUrl,
              communityName: communityIdentity?.name ?? cachedPost.communityName,
            }
          : cachedPost;
      }

      const authorProfile = row.author_id ? profileMap[row.author_id] : undefined;

      return {
        id: row.id,
        postType: normalizePostType(row.post_type),
        authorName: authorProfile?.display_name || 'Fan',
        authorId: row.author_id ?? undefined,
        authorDisplayName: authorProfile?.display_name ?? null,
        authorAvatarUrl: authorProfile?.avatar_url ?? null,
        authorFanLevelKey: authorProfile?.fan_level_key ?? null,
        actorType: row.actor_type ?? 'user',
        actorId: row.actor_id ?? row.author_id ?? undefined,
        actorDisplayName:
          row.actor_type === 'community'
            ? (communityIdentity?.name ?? null)
            : (authorProfile?.display_name ?? null),
        actorAvatarUrl:
          row.actor_type === 'community'
            ? (communityIdentity?.avatarUrl ?? null)
            : (authorProfile?.avatar_url ?? null),
        communityId: row.community_id ?? null,
        communityName:
          communityIdentity?.name ??
          (row.community_id ? communityMap[row.community_id] : undefined),
        feedTargets: Array.isArray(row.feed_targets) ? row.feed_targets : ['home'],
        createdAt: row.created_at,
        text: row.text ?? '',
        poll_data: row.poll_data ?? null,
        linkPreview: normalizeLinkPreview(row.link_preview),
        media: normalizeMedia(row.media),
        likesCount: 0,
        commentsCount: 0,
        likedByMe: false,
      };
    },
    [cachedPostsById, communityMap, profileMap],
  );

  const fetchPostsByIds = useCallback(
    async (postIds: string[]): Promise<HashtagPostRow[]> => {
      if (postIds.length === 0) {
        return [];
      }

      const { data, error: queryError } = await supabase
        .from('posts')
        .select(HASHTAG_POST_SELECT)
        .in('id', postIds);

      if (queryError) {
        logHashtagQueryError('Missing hashtag parent post lookup', queryError);
        throw queryError;
      }

      return (data || []) as HashtagPostRow[];
    },
    [logHashtagQueryError],
  );

  const loadTaggedPosts = useCallback(async () => {
    if (!tag) {
      setTaggedPosts([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        { data: directPostData, error: directPostError },
        { data: commentData, error: commentError },
      ] = await Promise.all([
        supabase
          .from('posts')
          .select(HASHTAG_POST_SELECT)
          .ilike('text', `%#${tag}%`)
          .order('created_at', { ascending: false }),
        supabase
          .from('comments_v2')
          .select('target_id, text')
          .eq('target_type', POST_ENGAGEMENT_TARGET_TYPE)
          .ilike('text', `%#${tag}%`),
      ]);

      if (directPostError) {
        logHashtagQueryError('Direct hashtag post lookup', directPostError);
        throw directPostError;
      }

      if (commentError) {
        logHashtagQueryError('Hashtag comment lookup', commentError);
        throw commentError;
      }

      const directPostRows = ((directPostData || []) as HashtagPostRow[]).filter((row) =>
        extractHashtags(row.text ?? '').includes(tag),
      );
      const directPostIds = new Set(directPostRows.map((row) => row.id));
      const missingCommentParentPostIds = Array.from(
        new Set(
          ((commentData || []) as HashtagCommentRow[])
            .filter((row) => extractHashtags(row.text ?? '').includes(tag))
            .map((row) => row.target_id)
            .filter(
              (postId): postId is string =>
                typeof postId === 'string' && postId.length > 0 && !directPostIds.has(postId),
            ),
        ),
      );
      const commentParentPostRows = await fetchPostsByIds(missingCommentParentPostIds);
      const hashtagPostRows = [...directPostRows, ...commentParentPostRows];
      const communityIds = Array.from(
        new Set(
          hashtagPostRows
            .filter((row) => row.actor_type === 'community')
            .map((row) => row.actor_id ?? row.community_id)
            .filter((communityId): communityId is string => Boolean(communityId)),
        ),
      );
      const communityIdentityMap = new Map<string, HashtagCommunityIdentity>();

      if (communityIds.length > 0) {
        const { data: communityData, error: communityError } = await supabase
          .from('communities')
          .select('id, name, avatar_url, avatar_path')
          .in('id', communityIds);

        if (communityError) {
          logHashtagQueryError('Community actor lookup', communityError);
        } else {
          (communityData || []).forEach((community) => {
            communityIdentityMap.set(community.id, {
              name: community.name,
              avatarUrl: resolveAvatarUrl(community.avatar_url ?? community.avatar_path ?? null),
            });
          });
        }
      }

      const seenPostIds = new Set<string>();
      const nextPosts = hashtagPostRows
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((row) => mapRowToPost(row, communityIdentityMap))
        .filter((post): post is Post => {
          if (!post || seenPostIds.has(post.id)) {
            return false;
          }

          seenPostIds.add(post.id);
          return true;
        });

      setTaggedPosts(nextPosts);
    } catch (err) {
      logger.error('[HashtagScreen] Failed to load hashtag feed', err);
      setError('Kunne ikke hente opslag for hashtag');
    } finally {
      setLoading(false);
    }
  }, [fetchPostsByIds, logHashtagQueryError, mapRowToPost, tag]);

  useEffect(() => {
    void loadTaggedPosts();
  }, [loadTaggedPosts]);

  const handleDeleted = useCallback(
    (postId: string) => {
      removePost(postId);
      setTaggedPosts((current) => current.filter((post) => post.id !== postId));
    },
    [removePost],
  );

  const renderItem = useCallback(
    ({ item }: { item: Post }) => {
      const authorProfile = item.authorId ? profileMap[item.authorId] : undefined;
      const key = getPostEngagementIdentity(item.id).key;
      const likeState = likeMap[key] || { liked: false, likes: 0 };
      const commentCount = commentCountMap[key] || 0;
      const previews = commentPreviewMap[key] || [];

      return (
        <View style={styles.cardWrap}>
          <FanPostCard
            post={item}
            authorProfile={authorProfile}
            communityMap={communityMap}
            profileMap={profileMap}
            currentUserId={user?.id}
            currentIsAppAdmin={isAppAdmin}
            liked={likeState.liked}
            likes={likeState.likes}
            commentsCount={commentCount}
            commentPreviews={previews}
            onToggleLike={() => {
              if (user?.id) {
                void toggleLike(POST_ENGAGEMENT_TARGET_TYPE, item.id, user.id);
              }
            }}
            onDeleted={handleDeleted}
            onNewComment={(comment) => {
              incrementCommentCount(POST_ENGAGEMENT_TARGET_TYPE, item.id);
              addCommentPreview(POST_ENGAGEMENT_TARGET_TYPE, item.id, comment);
            }}
          />
        </View>
      );
    },
    [
      addCommentPreview,
      commentCountMap,
      commentPreviewMap,
      communityMap,
      handleDeleted,
      incrementCommentCount,
      isAppAdmin,
      likeMap,
      profileMap,
      styles.cardWrap,
      toggleLike,
      user?.id,
    ],
  );

  const subtitle = loading ? 'Henter opslag' : `${taggedPosts.length} opslag`;

  return (
    <View style={styles.container}>
      <AppHeader title={`#${tag || 'hashtag'}`} subtitle={subtitle} showProfileButton={false} />
      {loading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={theme.colors.brand.accent} />
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text variant="body" color="error" style={styles.stateText}>
            {error}
          </Text>
        </View>
      ) : (
        <FlatList
          data={taggedPosts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.listContent,
            taggedPosts.length === 0 ? styles.listContentEmpty : null,
          ]}
          ListEmptyComponent={
            <Text variant="body" color="secondary" style={styles.stateText}>
              Ingen opslag med #{tag} endnu
            </Text>
          }
        />
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.bg.default,
    },
    listContent: {
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[4],
    },
    listContentEmpty: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    cardWrap: {
      marginBottom: theme.spacing[3],
    },
    stateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing[6],
    },
    stateText: {
      textAlign: 'center',
    },
  });
}
