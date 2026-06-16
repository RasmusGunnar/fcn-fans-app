// DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  GestureResponderEvent,
  Image,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../ui';
import { OptionsMenu, OptionsMenuOption } from '../OptionsMenu';
import { CardMedia } from './CardMedia';
import { CardRoot } from './CardRoot';
import { CardHeader } from './CardHeader';
import { Avatar } from '../Avatar';
import { FanLevelBadge } from '../fan/FanLevelBadge';
import { defaultTheme } from '../../theme';
import { Post } from '../../types/post';
import { getSafeFanLevelKey } from '../../lib/fanLevel';
import { supabase } from '../../lib/supabase';
import { navigationRef } from '../../navigation/navigationRef';
import * as Linking from 'expo-linking';
import {
  getMediaKind,
  normalizeMedia,
  resolveMediaUrl,
  resolveRenderableMedia,
  resolveVideoThumbnailUrl,
} from '../../utils/media';
import { canEditPost, canDeleteFeedItem } from '../../utils/permissions';
import type { CommentPreview } from '../../services/likesApi';
import type { CategoryKey } from '../../theme/categories';
import { buildCardBehaviorModel } from './cardBehaviorModel';
import { resolveActorLine, type ProfileMap } from '../../utils/actor';
import {
  buildFeedVideoPresentation,
  buildMediaViewerParams,
  toggleVideoMuted,
  VIDEO_MUTED_BY_DEFAULT,
} from '../../utils/videoPlaybackBehavior';
import { ArticlePreview } from './ArticlePreview';
import { getMediaArticleHeaderPresentation } from '../../utils/mediaArticlePresentation';
import { MediaArticleSourceAvatar } from './MediaArticleSourceAvatar';
import { FeedVideo } from '../feed/FeedVideo';
import {
  resolveFanPostBadgeCandidate,
  type FanPostBadgeAuthorProfile,
} from '../../utils/fanPostBadge';

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

interface FanPostCardProps {
  post: Post;
  authorProfile?: FanPostBadgeAuthorProfile;
  communityMap?: Record<string, string>;
  profileMap?: ProfileMap;
  categoryKey?: CategoryKey;
  currentUserId?: string;
  currentIsAppAdmin?: boolean;
  liked?: boolean;
  likes?: number;
  commentsCount?: number;
  commentPreviews?: CommentPreview[];
  onToggleLike?: () => void;
  onPressShare?: () => void;
  onDeleted?: (postId: string) => void;
  onOpenDetail?: () => void; // Optional navigation to post detail
  onNewComment?: (comment: CommentPreview) => void;
  initiallyOpenComments?: boolean;
  maxInlineComments?: number;
  bodyContent?: React.ReactNode;
  /** Whether this card's video is the currently active inline player. */
  isActiveVideo?: boolean;
}

export function FanPostCard({
  post,
  authorProfile,
  communityMap,
  profileMap,
  currentUserId,
  currentIsAppAdmin,
  liked = post.likedByMe,
  likes = post.likesCount,
  commentsCount = 0,
  commentPreviews = [],
  onToggleLike = () => {},
  onPressShare = () => {},
  onDeleted = () => {},
  onOpenDetail,
  onNewComment,
  initiallyOpenComments = false,
  maxInlineComments = 2,
  bodyContent,
  isActiveVideo = false,
}: FanPostCardProps) {
  const navigation = useNavigation<any>();
  const timeAgo = getTimeAgo(post.createdAt);
  const isMediaArticle = post.postType === 'media_article';
  const bodyText = post.text?.trim() ?? '';
  const mediaArticleHeader = useMemo(
    () => getMediaArticleHeaderPresentation(post.postType, post.linkPreview),
    [post.linkPreview, post.postType],
  );
  const groupDisplay = post.communityName || post.factionName;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [inlineVideoMuted, setInlineVideoMuted] = useState(VIDEO_MUTED_BY_DEFAULT);

  const viewerUserId = currentUserId;
  const viewerIsAppAdmin = currentIsAppAdmin ?? false;

  const mediaArr = useMemo(
    () => (isMediaArticle ? [] : normalizeMedia(post.media)),
    [isMediaArticle, post.media],
  );
  const firstMedia = useMemo(() => mediaArr[0], [mediaArr]);
  const mediaKind = getMediaKind(firstMedia);
  const mediaUri = useMemo(() => resolveMediaUrl(firstMedia), [firstMedia]);
  const isVideo = mediaKind === 'video';
  const imageUrl = mediaKind === 'image' ? mediaUri : null;
  const thumbnailUrl = useMemo(
    () => (isVideo ? resolveVideoThumbnailUrl(firstMedia) : null),
    [firstMedia, isVideo],
  );
  const videoPresentation = useMemo(
    () => buildFeedVideoPresentation(mediaUri, thumbnailUrl),
    [mediaUri, thumbnailUrl],
  );
  useEffect(() => {
    setInlineVideoMuted(VIDEO_MUTED_BY_DEFAULT);
  }, [mediaUri]);
  useEffect(() => {
    if (!isActiveVideo) {
      setInlineVideoMuted(VIDEO_MUTED_BY_DEFAULT);
    }
  }, [isActiveVideo]);
  const handleToggleInlineVideoMuted = useCallback(() => {
    setInlineVideoMuted(toggleVideoMuted);
  }, []);
  const videoAspectRatio = useMemo(() => {
    const width = firstMedia?.width ?? firstMedia?.metadata?.width;
    const height = firstMedia?.height ?? firstMedia?.metadata?.height;
    if (!width || !height) return 4 / 5;
    const natural = width / height;
    if (natural < 0.9) return 4 / 5;
    if (natural > 1.1) return 16 / 9;
    return 1;
  }, [firstMedia]);
  const imageAspectRatio = useMemo(() => {
    if (mediaKind !== 'image' || !firstMedia) return 1;
    const w = firstMedia.width || firstMedia.metadata?.width;
    const h = firstMedia.height || firstMedia.metadata?.height;
    if (!w || !h) return 1;
    const natural = w / h;
    return Math.min(Math.max(natural, 4 / 5), 1.91);
  }, [mediaKind, firstMedia]);

  const deepLink = Linking.createURL(`/post/${post.id}`);
  const handleShare = () => {
    Share.share({ message: `${post.text}\n${deepLink}` }).catch(() => {});
  };
  const handleOpenMediaViewer = (index: number) => (event?: GestureResponderEvent) => {
    event?.stopPropagation();
    const resolvedMedia = resolveRenderableMedia(post.media);
    const params = buildMediaViewerParams(resolvedMedia, index, post.id);
    if (!params) {
      return;
    }

    if (navigationRef.isReady()) {
      navigationRef.navigate('MediaViewer', params);
      return;
    }

    navigation.navigate('MediaViewer', params);
  };

  // Permission checks - use isAppAdmin from context
  // TODO: Add community role when posts have community_id
  const showEditOption = canEditPost(viewerUserId, viewerIsAppAdmin, { author_id: post.authorId });

  const handleEditPost = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    const { error } = await supabase
      .from('posts')
      .update({ text: editText.trim() })
      .eq('id', post.id);
    if (error) {
      Alert.alert('Fejl', 'Kunne ikke opdatere opslaget');
      console.warn('Update post error', error);
    } else {
      post.text = editText.trim();
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditText(post.text);
    setIsEditing(false);
  };

  const handleDeletePost = async () => {
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) {
      Alert.alert('Fejl', 'Kunne ikke slette opslaget');
      console.warn('Delete post error', error);
    } else {
      onDeleted(post.id);
    }
  };

  // Build card behavior model to determine category, name line, and press behavior
  const communityId = (post as any).communityId ?? (post as any).community_id ?? null;
  const isCommunityPost = !!communityId;
  const showDeleteOption = canDeleteFeedItem({
    isAppAdmin: viewerIsAppAdmin,
    viewerUserId,
    itemAuthorId: post.authorId,
    itemActorType: isCommunityPost ? 'community' : 'user',
    itemCommunityRole: null,
  });
  const postMenuOptions: OptionsMenuOption[] = [];
  if (showEditOption) {
    postMenuOptions.push({ label: 'Redigér', onPress: handleEditPost, icon: 'create-outline' });
  }
  if (showDeleteOption) {
    postMenuOptions.push({
      label: 'Slet',
      onPress: handleDeletePost,
      destructive: true,
      icon: 'trash-outline',
    });
  }
  const communityName =
    communityId && communityMap?.[communityId] ? communityMap[communityId] : null;

  const cardModel = buildCardBehaviorModel({
    kind: 'post',
    actorType: isCommunityPost ? 'community' : 'fan',
    actorName: isCommunityPost
      ? (communityName ?? 'Fællesskab')
      : authorProfile?.display_name || (post as any).authorName || 'Ukendt',
    postLinkUrl: undefined, // Posts don't have embedded links in current data model
  });

  // Compute onOpenDetail based on model
  const computedOnOpenDetail =
    cardModel.pressBehavior === 'open_external' && cardModel.externalUrl
      ? () => Linking.openURL(cardModel.externalUrl!)
      : cardModel.pressBehavior === 'none'
        ? undefined
        : onOpenDetail;

  const resolvedAuthor = resolveActorLine({
    actorType: isCommunityPost ? 'community' : 'user',
    authorId: post.authorId,
    authorEmail: authorProfile?.display_name || (post as any).authorName || undefined,
    profileMap,
    communityName: isCommunityPost ? (communityName ?? undefined) : undefined,
  });
  const headerTitle = cardModel.nameLine ?? resolvedAuthor.displayName;
  const headerSubtitle = isCommunityPost
    ? timeAgo
    : groupDisplay
      ? `${groupDisplay} · ${timeAgo}`
      : timeAgo;
  const fanLevelCandidate = resolveFanPostBadgeCandidate({
    postType: post.postType,
    actorType: isCommunityPost ? 'community' : post.actorType,
    authorProfile,
    postAuthorFanLevelKey: post.authorFanLevelKey,
  });
  const authorFanLevel = fanLevelCandidate ? getSafeFanLevelKey(fanLevelCandidate) : null;

  return (
    <CardRoot
      targetType="post"
      targetId={post.id}
      currentUserId={viewerUserId}
      isAppAdmin={viewerIsAppAdmin}
      profileMap={profileMap}
      onOpenDetail={computedOnOpenDetail}
      commentPreviews={commentPreviews}
      initiallyOpen={initiallyOpenComments}
      maxInlineComments={maxInlineComments}
      onNewComment={onNewComment}
      actions={{
        liked,
        likes,
        comments: commentsCount,
        onToggleLike,
        onPressShare: handleShare,
      }}
    >
      {mediaArticleHeader ? (
        <CardHeader
          avatarSlot={
            <MediaArticleSourceAvatar
              sourceName={mediaArticleHeader.sourceName}
              initials={mediaArticleHeader.initials}
              avatarUrl={mediaArticleHeader.avatarUrl}
              size={40}
            />
          }
          fallbackTitle={mediaArticleHeader.sourceName}
          subtitle={`${timeAgo} \u00b7 ${mediaArticleHeader.secondaryLabel}`}
          rightSlot={
            (showEditOption || showDeleteOption) && postMenuOptions.length > 0 ? (
              <OptionsMenu options={postMenuOptions} />
            ) : undefined
          }
        />
      ) : (
        <>
          <CardHeader
            avatarSlot={
              <Avatar
                userId={post.authorId}
                avatarUrl={authorProfile?.avatar_url ?? post.authorAvatarUrl}
                size={40}
                label={authorProfile?.display_name || post.authorName || 'Fan'}
              />
            }
            nameLine={cardModel.nameLine}
            fallbackTitle={headerTitle}
            subtitle={headerSubtitle}
            inlineBadge={
              authorFanLevel ? <FanLevelBadge level={authorFanLevel} size="sm" /> : undefined
            }
            rightSlot={
              (showEditOption || showDeleteOption) && postMenuOptions.length > 0 ? (
                <OptionsMenu options={postMenuOptions} />
              ) : undefined
            }
          />
        </>
      )}
      {isEditing ? (
        <View style={styles.editContainer}>
          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
          />
          <View style={styles.editActions}>
            <Pressable style={styles.editButton} onPress={handleCancelEdit}>
              <Text variant="caption" color="primary" style={styles.editButtonTextCancel}>
                Annuller
              </Text>
            </Pressable>
            <Pressable style={[styles.editButton, styles.editButtonSave]} onPress={handleSaveEdit}>
              <Text variant="caption" color="inverse" style={styles.editButtonText}>
                Gem
              </Text>
            </Pressable>
          </View>
        </View>
      ) : bodyContent ? (
        bodyContent
      ) : bodyText.length > 0 ? (
        <Text variant="body" color="primary" style={styles.text}>
          {bodyText}
        </Text>
      ) : null}
      {isMediaArticle && post.linkPreview ? (
        <ArticlePreview preview={post.linkPreview} fallbackLabel="Artikel" />
      ) : !firstMedia ? null : isVideo ? (
        videoPresentation.canOpen ? (
          <CardMedia fullBleed aspectRatio={null}>
            {videoPresentation.mountsInlinePlayer && isActiveVideo ? (
              <FeedVideo
                uri={mediaUri!}
                isActive
                muted={inlineVideoMuted}
                onPress={handleOpenMediaViewer(0)}
                onToggleMuted={handleToggleInlineVideoMuted}
                naturalWidth={firstMedia?.width ?? firstMedia?.metadata?.width}
                naturalHeight={firstMedia?.height ?? firstMedia?.metadata?.height}
                posterUri={videoPresentation.posterUri ?? undefined}
              />
            ) : (
              <Pressable
                style={styles.mediaPressable}
                onPress={handleOpenMediaViewer(0)}
                accessibilityRole="button"
                accessibilityLabel="Åbn video"
              >
                <CardMedia aspectRatio={videoAspectRatio}>
                  {videoPresentation.posterUri ? (
                    <Image
                      source={{ uri: videoPresentation.posterUri }}
                      style={styles.mediaImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.videoPosterFallback} />
                  )}
                  <View style={styles.videoOverlay} pointerEvents="none">
                    <Ionicons
                      name="play"
                      size={theme.components.icon.size.lg}
                      color={theme.colors.text.inverse}
                    />
                  </View>
                </CardMedia>
              </Pressable>
            )}
          </CardMedia>
        ) : (
          <CardMedia fullBleed aspectRatio={null}>
            <View style={styles.videoPlaceholder}>
              <Text variant="caption" color="secondary">
                Video kunne ikke afspilles
              </Text>
            </View>
          </CardMedia>
        )
      ) : imageUrl && !imageLoadError ? (
        <CardMedia fullBleed aspectRatio={imageAspectRatio}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.mediaImage}
            resizeMode="cover"
            onError={(e) => {
              if (__DEV__) {
                console.log('[PostImageError]', {
                  postId: post.id,
                  uri: imageUrl,
                  native: e?.nativeEvent,
                });
              }
              setImageLoadError(true);
            }}
          />
        </CardMedia>
      ) : imageLoadError && __DEV__ ? (
        <View style={styles.imageErrorContainer}>
          <Text variant="caption" color="secondary" style={styles.imageErrorText}>
            ⚠️ Billede kunne ikke indlæses
          </Text>
        </View>
      ) : (
        <View style={styles.mediaFallback}>
          <Text variant="caption" color="secondary">
            Uventet mediaformat
          </Text>
          {__DEV__ && (
            <Text
              variant="caption"
              color="secondary"
              style={{ marginTop: theme.spacing[1] }}
            >
              Kind: {mediaKind} • URI: {mediaUri ? 'yes' : 'no'}
            </Text>
          )}
        </View>
      )}
    </CardRoot>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  text: {
    marginBottom: theme.spacing[3],
  },
  imagePlaceholder: {
    height: 120,
    backgroundColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.border.default,
  },
  mediaPressable: {
    width: '100%',
  },
  videoPosterFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.overlay.fullscreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageErrorContainer: {
    padding: theme.spacing[2],
    marginVertical: theme.spacing[1],
    backgroundColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
  },
  imageErrorText: {
    textAlign: 'center',
  },
  videoPlaceholder: {
    height: 120,
    backgroundColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  mediaFallback: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: theme.colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[3],
  },
  commentsContainer: {
    paddingTop: theme.spacing[2],
    gap: theme.spacing[2],
  },
  commentRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.border.default,
  },
  commentBody: { flex: 1 },
  commentText: { color: theme.colors.text.primary },
  commentMeta: { color: theme.colors.text.secondary },
  commentDelete: {
    color: theme.colors.primary,
    ...theme.typography.h3,
  },
  composerRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    alignItems: 'center',
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    color: theme.colors.text.primary,
    ...theme.typography.body,
  },
  composerSend: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
  },
  composerSendText: { color: theme.colors.bg.card },
  editContainer: {
    marginBottom: theme.spacing[3],
  },
  editInput: {
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    padding: theme.spacing[2],
    color: theme.colors.text.primary,
    ...theme.typography.body,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing[2],
    gap: theme.spacing[2],
  },
  editButton: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
  },
  editButtonSave: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  editButtonText: {
    color: theme.colors.bg.card,
  },
  editButtonTextCancel: {
    color: theme.colors.text.primary,
  },
});
