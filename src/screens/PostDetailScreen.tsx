import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthProvider';
import { Text } from '../components/ui';
import { colors, spacing } from '../theme';
import { AppHeader } from '../components/AppHeader';
import { useFeed } from '../state/FeedContext';
import { FanPostCard } from '../components/cards/FanPostCard';
import { PollCard } from '../components/PollCard';
import { fetchPostDetailById, type PostDetailResult } from '../services/postsApi';
import { getPostEngagementIdentity, POST_ENGAGEMENT_TARGET_TYPE } from '../utils/postEngagement';

type PostDetailRouteParams = {
  postId?: string;
  id?: string;
  commentId?: string;
  parentCommentId?: string;
  notificationType?: string;
  communityId?: string;
  entityId?: string;
  entityType?: string;
  previewText?: string;
  isPoll?: boolean;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export default function PostDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute() as { params?: PostDetailRouteParams };
  const { user, isAppAdmin } = useAuth();
  const postId = route?.params?.postId ?? route?.params?.id ?? '';
  const {
    posts,
    profileMap,
    communityMap,
    likeMap,
    commentCountMap,
    commentPreviewMap,
    removePost,
    hydratePostEngagement,
    toggleLike,
    incrementCommentCount,
    addCommentPreview,
  } = useFeed();
  const [detailData, setDetailData] = useState<PostDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const feedPost = posts.find((item) => item.id === postId);

  // Preserve notification comment/reply context until dedicated scroll/highlight is implemented.
  const initialCommentContext = useMemo(
    () => ({
      commentId: readString(route?.params?.commentId),
      parentCommentId: readString(route?.params?.parentCommentId),
      notificationType: readString(route?.params?.notificationType),
      communityId: readString(route?.params?.communityId),
      entityId: readString(route?.params?.entityId),
      entityType: readString(route?.params?.entityType),
      previewText: readString(route?.params?.previewText),
      isPoll: route?.params?.isPoll === true,
    }),
    [route?.params],
  );
  const hasCommentContext = Boolean(
    initialCommentContext.commentId || initialCommentContext.parentCommentId,
  );

  const loadPost = useCallback(async () => {
    if (!postId) {
      setLoadError('Mangler opslag-id.');
      setDetailData(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const nextDetailData = await fetchPostDetailById(postId, user?.id ?? null);

      if (!nextDetailData) {
        setDetailData(null);
        setLoadError('Opslaget kunne ikke findes.');
        return;
      }

      hydratePostEngagement({
        postId: nextDetailData.post.id,
        liked: nextDetailData.engagement.liked,
        likes: nextDetailData.engagement.likes,
        commentsCount: nextDetailData.engagement.commentsCount,
        commentPreviews: nextDetailData.engagement.commentPreviews,
      });
      setDetailData(nextDetailData);
    } catch (error: any) {
      setDetailData(null);
      setLoadError(error?.message || 'Kunne ikke hente opslaget.');
    } finally {
      setLoading(false);
    }
  }, [hydratePostEngagement, postId, user?.id]);

  useEffect(() => {
    if (feedPost) {
      setLoadError(null);
      return;
    }

    void loadPost();
  }, [feedPost, loadPost]);

  const post = feedPost ?? detailData?.post ?? null;
  const authorProfile = post?.authorId
    ? profileMap[post.authorId] ?? detailData?.authorProfile ?? undefined
    : undefined;
  const postProfileMap = useMemo(() => {
    if (!post?.authorId || !authorProfile) {
      return profileMap;
    }

    return {
      ...profileMap,
      [post.authorId]: {
        ...profileMap[post.authorId],
        ...authorProfile,
      },
    };
  }, [authorProfile, post?.authorId, profileMap]);
  const engagementKey = post ? getPostEngagementIdentity(post.id).key : null;
  const likeState =
    (engagementKey ? likeMap[engagementKey] : undefined) ?? {
      liked: detailData?.engagement.liked ?? post?.likedByMe ?? false,
      likes: detailData?.engagement.likes ?? post?.likesCount ?? 0,
    };
  const commentsCount =
    (engagementKey ? commentCountMap[engagementKey] : undefined) ??
    detailData?.engagement.commentsCount ??
    post?.commentsCount ??
    0;
  const commentPreviews =
    (engagementKey ? commentPreviewMap[engagementKey] : undefined) ??
    detailData?.engagement.commentPreviews ??
    [];

  const handleDeleted = (deletedPostId: string) => {
    removePost(deletedPostId);
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('HomeMain');
  };

  const renderBody = () => {
    if (loading && !post) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.fcnRed} />
          <Text variant="body" color="secondary" style={styles.stateText}>
            Henter opslag...
          </Text>
        </View>
      );
    }

    if (!post) {
      return (
        <View style={styles.centerState}>
          <Text variant="body" color="primary" style={styles.stateTitle}>
            {loadError ?? 'Opslaget kunne ikke findes.'}
          </Text>
          <View style={styles.actionsRow}>
            <Pressable style={styles.secondaryButton} onPress={() => void loadPost()}>
              <Text variant="caption" color="primary">
                Prøv igen
              </Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('HomeMain')}>
              <Text variant="caption" color="inverse">
                Gå til Home
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.content}>
        <FanPostCard
          post={post}
          authorProfile={authorProfile}
          communityMap={communityMap}
          profileMap={postProfileMap}
          currentUserId={user?.id}
          currentIsAppAdmin={isAppAdmin}
          liked={likeState.liked}
          likes={likeState.likes}
          commentsCount={commentsCount}
          commentPreviews={commentPreviews}
          initiallyOpenComments={hasCommentContext}
          maxInlineComments={hasCommentContext ? Number.MAX_SAFE_INTEGER : 2}
          onToggleLike={() => {
            if (user?.id) {
              void toggleLike(POST_ENGAGEMENT_TARGET_TYPE, post.id, user.id);
            }
          }}
          onDeleted={handleDeleted}
          onNewComment={(comment) => {
            incrementCommentCount(POST_ENGAGEMENT_TARGET_TYPE, post.id);
            addCommentPreview(POST_ENGAGEMENT_TARGET_TYPE, post.id, comment);
          }}
          bodyContent={
            post.poll_data ? <PollCard pollData={post.poll_data} postId={post.id} profileMap={postProfileMap} /> : undefined
          }
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader title="Opslag" subtitle="" showProfileButton={false} />
      <ScrollView
        style={styles.scrollView}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
      >
        {renderBody()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollView: { flex: 1 },
  content: { paddingVertical: spacing.md },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  stateText: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  stateTitle: {
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.fcnRed,
  },
  primaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.sm,
    backgroundColor: colors.fcnRed,
  },
});
