// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import * as Linking from 'expo-linking';
import React, { useEffect, useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthProvider';
import { getSafeFanLevelKey } from '../../lib/fanLevel';
import { logger } from '../../lib/logger';
import { supabase } from '../../lib/supabase';
import { navigationRef } from '../../navigation/navigationRef';
import type { CommentPreview } from '../../services/likesApi';
import { resolveProfileIdByUsername } from '../../services/postEntities';
import { defaultTheme } from '../../theme';
import type { CategoryKey } from '../../theme/categories';
import { Post } from '../../types/post';
import { resolveActorLine, type ProfileMap } from '../../utils/actor';
import { resolveRenderableMedia } from '../../utils/media';
import { cleanText } from '../../utils/text';
import { useCommunityRole } from '../../hooks/useCommunityRole';
import { canDeleteFeedItem, canEditPost } from '../../utils/permissions';
import { renderTextWithEntities } from '../../utils/renderTextWithEntities';
import { Avatar } from '../Avatar';
import { FanLevelBadge } from '../fan/FanLevelBadge';
import { FeedVideo } from '../feed/FeedVideo';
import { OptionsMenu, OptionsMenuOption } from '../OptionsMenu';
import { Text } from '../ui';
import { buildCardBehaviorModel } from './cardBehaviorModel';
import { CardHeader } from './CardHeader';
import { CardRoot } from './CardRoot';

// ── Image ratio detection ───────────────────────────────────────
// Global cache so we never call Image.getSize twice for the same URI
const ratioCache = new Map<string, number>();

/**
 * Map a natural w/h ratio to an Instagram-style feed bucket.
 *   portrait  (ratio < 0.9)  → 4/5
 *   square    (0.9 ≤ r ≤ 1.1) → 1
 *   landscape (ratio > 1.1)  → 16/9
 */
function pickImageRatio(w: number, h: number): number {
  const r = w / h;
  if (r < 0.9) return 4 / 5;
  if (r <= 1.1) return 1;
  return 16 / 9;
}

const IMAGE_RATIO_FALLBACK = 4 / 5; // Instagram default while loading

/**
 * Hook: resolve the best aspectRatio for a given image URI.
 * - If metadata (width/height) is available from post.media, use it immediately.
 * - Otherwise call Image.getSize once, cache the result, and re-render.
 * - Fallback while loading: 4:5 (portrait, Instagram feed default).
 */
function useImageRatio(uri: string | null, metaWidth?: number, metaHeight?: number): number {
  // Fast path: metadata available
  const metaRatio = useMemo(() => {
    if (metaWidth && metaHeight && metaWidth > 0 && metaHeight > 0) {
      return pickImageRatio(metaWidth, metaHeight);
    }
    return null;
  }, [metaWidth, metaHeight]);

  const [detected, setDetected] = useState<number | null>(() => {
    if (metaRatio != null) return metaRatio;
    if (uri && ratioCache.has(uri)) return ratioCache.get(uri)!;
    return null;
  });

  useEffect(() => {
    // If we already have a ratio (meta or cached), skip getSize
    if (metaRatio != null || !uri) return;
    if (ratioCache.has(uri)) {
      setDetected(ratioCache.get(uri)!);
      return;
    }
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        const r = pickImageRatio(w, h);
        ratioCache.set(uri, r);
        if (!cancelled) setDetected(r);
      },
      () => {
        // getSize failed – keep fallback
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri, metaRatio]);

  return metaRatio ?? detected ?? IMAGE_RATIO_FALLBACK;
}

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

// BASELINE: Type-safe media normalization
type MediaItem = {
  bucket?: string;
  path?: string;
  type?: string;
  width?: number;
  height?: number;
  thumbnail_path?: string;
  thumbnail_bucket?: string;
  url?: string;
  publicUrl?: string;
  metadata?: any;
};

function normalizeMedia(raw: any): MediaItem[] {
  // BASELINE: Deterministic parsing - no silent failures
  // Handle null/undefined
  if (!raw) return [];

  // Already an array
  if (Array.isArray(raw)) return raw;

  // JSON string - parse it
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object' && parsed !== null) {
        const hasMediaShape =
          'path' in parsed ||
          'bucket' in parsed ||
          'type' in parsed ||
          'url' in parsed ||
          'uri' in parsed ||
          'publicUrl' in parsed;
        return hasMediaShape ? [parsed] : [];
      }
      return [];
    } catch {
      if (__DEV__) {
        console.warn('[normalizeMedia] Failed to parse JSON string:', raw);
      }
      return [];
    }
  }

  // BASELINE FIX: Single object → wrap only if it has media-like shape
  if (typeof raw === 'object' && raw !== null) {
    const hasMediaShape =
      'path' in raw ||
      'bucket' in raw ||
      'type' in raw ||
      'url' in raw ||
      'uri' in raw ||
      'publicUrl' in raw;
    if (__DEV__ && !hasMediaShape) {
      console.warn('[normalizeMedia] Object missing media fields:', Object.keys(raw));
    }
    return hasMediaShape ? [raw] : [];
  }

  return [];
}

interface FanPostCardProps {
  post: Post;
  authorProfile?: {
    display_name: string | null;
    avatar_url: string | null;
    fan_level_key?: string | null;
  };
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
  isActiveVideo?: boolean;
  isAppActive?: boolean;
  onActivateVideo?: () => void;
  bodyContent?: React.ReactNode;
}

export function FanPostCard({
  post,
  authorProfile,
  communityMap,
  profileMap,
  categoryKey,
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
  isActiveVideo = false,
  isAppActive = true,
  onActivateVideo,
  bodyContent,
}: FanPostCardProps) {
  const navigation = useNavigation<any>();
  const timeAgo = getTimeAgo(post.createdAt);
  const groupDisplay = cleanText(post.communityName || post.factionName);
  const cleanedPostText = cleanText(post.text);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(cleanedPostText);
  const [imageLoadError, setImageLoadError] = useState(false);

  const { user, isAppAdmin } = useAuth();
  const viewerUserId = currentUserId ?? user?.id;
  const viewerIsAppAdmin = currentIsAppAdmin ?? isAppAdmin;
  const postAuthorId = post.authorId ?? (post as any).author_id ?? null;
  const postActorType = post.actorType ?? (post as any).actor_type ?? 'user';
  const postActorId = post.actorId ?? (post as any).actor_id ?? postAuthorId;
  const postCommunityId = post.communityId ?? (post as any).community_id ?? null;
  const authoredCommunityId =
    postActorType === 'community' ? postActorId || postCommunityId || null : null;
  const { role: authoredCommunityRole } = useCommunityRole(authoredCommunityId);

  // BASELINE: Deterministic media parsing with DEV logging
  const mediaArray = useMemo(() => normalizeMedia(post.media), [post.media]);
  const resolvedMedia = useMemo(() => resolveRenderableMedia(post.media), [post.media]);
  const primaryMedia = resolvedMedia[0] || null;
  const m0 = mediaArray[0] || null;
  const mediaKind = primaryMedia?.type ?? null;
  const hasMultipleMedia = resolvedMedia.length > 1;

  const mediaUri = primaryMedia?.uri ?? null;

  // Instagram-style aspect ratio for images (portrait→4:5, square→1:1, landscape→16:9)
  const imageAspectRatio = useImageRatio(
    mediaKind === 'image' ? mediaUri : null,
    primaryMedia?.width,
    primaryMedia?.height,
  );

  useEffect(() => {
    setImageLoadError(false);
  }, [mediaUri]);

  // BASELINE: Remove complex video state management - keep only essential edit handlers

  const deepLink = Linking.createURL(`/post/${post.id}`);
  const handleShare = () => {
    Share.share({ message: `${cleanedPostText}\n${deepLink}` }).catch(() => {});
  };
  const handleOpenMediaViewer = (index: number) => (event?: GestureResponderEvent) => {
    event?.stopPropagation();

    if (resolvedMedia.length === 0) {
      return;
    }

    const params = {
      items: resolvedMedia,
      initialIndex: Math.max(0, Math.min(index, resolvedMedia.length - 1)),
      postId: post.id,
    };

    if (navigationRef.isReady()) {
      navigationRef.navigate('MediaViewer', params);
      return;
    }

    navigation.navigate('MediaViewer', params);
  };

  // Permission checks - use isAppAdmin from context
  // TODO: Add community role when posts have community_id
  const showEditOption = canEditPost(
    viewerUserId,
    viewerIsAppAdmin,
    { author_id: postAuthorId ?? undefined },
    authoredCommunityRole,
  );

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
      logger.warn('Update post error', error);
    } else {
      post.text = editText.trim();
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditText(cleanedPostText);
    setIsEditing(false);
  };

  const handleDeletePost = async () => {
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) {
      Alert.alert('Fejl', 'Kunne ikke slette opslaget');
      logger.warn('Delete post error', error);
    } else {
      onDeleted(post.id);
    }
  };

  // Build card behavior model to determine category, name line, and press behavior
  const communityId = postCommunityId;
  const isCommunityPost = postActorType === 'community' || !!authoredCommunityId;
  const showDeleteOption = canDeleteFeedItem({
    isAppAdmin: viewerIsAppAdmin,
    viewerUserId,
    itemAuthorId: postAuthorId ?? undefined,
    itemActorType: isCommunityPost ? 'community' : 'user',
    itemCommunityRole: authoredCommunityRole,
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
  const communityName = cleanText(
    post.actorDisplayName ||
      (communityId && communityMap?.[communityId] ? communityMap[communityId] : ''),
  );
  const fallbackActorDisplayName =
    cleanText(post.actorDisplayName || (isCommunityPost ? communityName : '')) || '';
  const fallbackActorAvatarUrl = post.actorAvatarUrl ?? null;
  const fallbackAuthorDisplayName =
    cleanText(post.authorDisplayName || authorProfile?.display_name || (post as any).authorName) ||
    '';
  const fallbackAuthorAvatarUrl = authorProfile?.avatar_url ?? post.authorAvatarUrl ?? null;
  const fallbackAuthorFanLevelKey = authorProfile?.fan_level_key ?? post.authorFanLevelKey ?? null;
  const actorDisplayName = isCommunityPost
    ? fallbackActorDisplayName || communityName || 'Fællesskab'
    : fallbackAuthorDisplayName || 'Ukendt';
  const actorAvatarUrl = isCommunityPost ? fallbackActorAvatarUrl : fallbackAuthorAvatarUrl;
  const authorDisplayName = fallbackAuthorDisplayName || 'Ukendt';

  const cardModel = buildCardBehaviorModel({
    kind: 'post',
    actorType: isCommunityPost ? 'community' : 'fan',
    actorName: isCommunityPost ? communityName || 'Fællesskab' : authorDisplayName,
    postLinkUrl: undefined, // Posts don't have embedded links in current data model
  });

  // Compute onOpenDetail based on model
  const computedOnOpenDetail =
    cardModel.pressBehavior === 'open_external' && cardModel.externalUrl
      ? () => Linking.openURL(cardModel.externalUrl!)
      : cardModel.pressBehavior === 'none'
        ? undefined
        : onOpenDetail;

  const resolvedCategoryKey = categoryKey ?? 'fan'; // eslint-disable-line @typescript-eslint/no-unused-vars
  const resolvedAuthor = resolveActorLine({
    actorType: isCommunityPost ? 'community' : 'user',
    authorId: isCommunityPost ? undefined : (postAuthorId ?? undefined),
    authorEmail: isCommunityPost ? actorDisplayName || undefined : authorDisplayName || undefined,
    profileMap,
    communityName: isCommunityPost ? actorDisplayName || undefined : undefined,
  });
  const headerTitle = cleanText(cardModel.nameLine || resolvedAuthor.displayName) || 'Ukendt';
  const headerSubtitle = isCommunityPost
    ? timeAgo
    : groupDisplay
      ? cleanText(`${groupDisplay} · ${timeAgo}`)
      : timeAgo;

  const authorFanLevel = getSafeFanLevelKey(fallbackAuthorFanLevelKey);
  const hasRightSlot = postMenuOptions.length > 0;
  const mediaCountBadge = hasMultipleMedia ? (
    <View style={styles.mediaCountBadge}>
      <Text variant="caption" color="inverse">
        {`1 / ${resolvedMedia.length}`}
      </Text>
    </View>
  ) : null;
  const mentionLabels = useMemo(
    () =>
      Object.fromEntries(
        Object.values(profileMap ?? {})
          .filter(
            (profile) =>
              typeof profile.username === 'string' &&
              profile.username.trim().length > 0 &&
              typeof profile.display_name === 'string' &&
              profile.display_name.trim().length > 0,
          )
          .map((profile) => [profile.username!.toLowerCase(), cleanText(profile.display_name!)]),
      ),
    [profileMap],
  );

  return (
    <CardRoot
      targetType="post"
      targetId={post.id}
      currentUserId={viewerUserId}
      isAppAdmin={viewerIsAppAdmin}
      onOpenDetail={computedOnOpenDetail}
      commentPreviews={commentPreviews}
      onNewComment={onNewComment}
      profileMap={profileMap}
      actions={{
        liked,
        likes,
        comments: commentsCount,
        onToggleLike,
        onPressShare: handleShare,
      }}
    >
      <CardHeader
        avatarSlot={
          <Avatar
            userId={isCommunityPost ? undefined : (postAuthorId ?? undefined)}
            avatarUrl={actorAvatarUrl}
            size={40}
            label={actorDisplayName || authorDisplayName || 'Fan'}
          />
        }
        nameLine={cardModel.nameLine}
        fallbackTitle={headerTitle}
        subtitle={headerSubtitle}
        inlineBadge={<FanLevelBadge level={authorFanLevel} size="sm" labelMode="short" />}
        onPressAuthor={
          !isCommunityPost && postAuthorId
            ? () => navigation.navigate('PublicProfile', { userId: postAuthorId })
            : undefined
        }
        rightSlot={hasRightSlot ? <OptionsMenu options={postMenuOptions} /> : undefined}
      />
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
      ) : (
        <Text variant="body" color="primary" style={styles.text}>
          {renderTextWithEntities(cleanedPostText, {
            entityStyle: styles.entityText,
            mentionLabels,
            onPressTag: (tag) => navigation.navigate('Hashtag', { tag }),
            onPressMention: async (username) => {
              const profileId = await resolveProfileIdByUsername(username);

              if (profileId) {
                navigation.navigate('PublicProfile', { userId: profileId });
              }
            },
          })}
        </Text>
      )}
      {/* BASELINE: Deterministic media rendering - no silent failures */}
      {!m0 ? null : (
        <View style={styles.mediaOuter}>
          {!mediaKind ? (
            <View style={styles.mediaFallback}>
              <Text variant="caption" color="secondary">
                Ukendt mediaformat
              </Text>
              {__DEV__ && (
                <Text variant="caption" color="secondary" style={{ marginTop: theme.spacing[1] }}>
                  Type: {m0.type || 'none'}
                  {m0.bucket || m0.path ? ` • ${m0.bucket || '?'}/${m0.path || '?'}` : ''}
                  {Object.keys(m0).length > 0 ? ` • Keys: ${Object.keys(m0).join(', ')}` : ''}
                </Text>
              )}
            </View>
          ) : !mediaUri ? (
            <View style={styles.mediaFallback}>
              <Text variant="caption" color="secondary">
                Media kunne ikke indlæses
              </Text>
              {__DEV__ && (
                <Text variant="caption" color="secondary" style={{ marginTop: theme.spacing[1] }}>
                  Type: {mediaKind || 'unknown'}
                  {m0.bucket && m0.path ? ` • ${m0.bucket}/${m0.path}` : ''}
                </Text>
              )}
            </View>
          ) : mediaKind === 'video' ? (
            <Pressable style={styles.mediaPressable} onPress={handleOpenMediaViewer(0)}>
              <View style={styles.mediaContainer}>
                <FeedVideo
                  uri={mediaUri}
                  isActive={isActiveVideo}
                  isAppActive={isAppActive}
                  naturalWidth={primaryMedia?.width}
                  naturalHeight={primaryMedia?.height}
                  onError={(e) => {
                    logger.error('[VideoError]', { postId: post.id, error: e });
                  }}
                />
                {mediaCountBadge}
              </View>
            </Pressable>
          ) : mediaKind === 'image' ? (
            imageLoadError ? (
              <View style={styles.mediaFallback}>
                <Text variant="caption" color="secondary">
                  Billede kunne ikke indlæses
                </Text>
                {__DEV__ && (
                  <Text variant="caption" color="secondary" style={{ marginTop: theme.spacing[1] }}>
                    {mediaUri}
                  </Text>
                )}
              </View>
            ) : (
              <Pressable style={styles.mediaPressable} onPress={handleOpenMediaViewer(0)}>
                <View style={[styles.mediaContainer, { aspectRatio: imageAspectRatio }]}>
                  <Image
                    source={{ uri: mediaUri }}
                    style={styles.image}
                    resizeMode="cover"
                    onError={() => {
                      setImageLoadError(true);
                    }}
                  />
                  {mediaCountBadge}
                </View>
              </Pressable>
            )
          ) : (
            <View style={styles.mediaFallback}>
              <Text variant="caption" color="secondary">
                Uventet mediaformat
              </Text>
              {__DEV__ && (
                <Text variant="caption" color="secondary" style={{ marginTop: theme.spacing[1] }}>
                  Kind: {mediaKind} • URI: {mediaUri ? 'yes' : 'no'}
                </Text>
              )}
            </View>
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
  entityText: {
    color: theme.colors.brand.accent,
  },
  imagePlaceholder: {
    height: 120,
    backgroundColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  // FULL-BLEED: Media wrapper with negative margins
  mediaOuter: {
    marginHorizontal: -theme.layout.cardPadding,
    marginTop: theme.spacing[3],
    alignSelf: 'stretch',
  },
  mediaPressable: {
    width: '100%',
  },
  // Media container: width fills parent, aspect ratio determined by child (FeedVideo or image)
  mediaContainer: {
    width: '100%',
    backgroundColor: theme.colors.border.default,
  },
  mediaCountBadge: {
    position: 'absolute',
    top: theme.spacing[3],
    right: theme.spacing[3],
    minHeight: theme.spacing[8],
    minWidth: theme.spacing[12],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.overlay.heavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
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
