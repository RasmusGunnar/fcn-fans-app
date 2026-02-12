// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Image,
  TextInput,
  Pressable,
  Share,
  Alert,
} from 'react-native';
import { Text } from '../ui';
import { OptionsMenu, OptionsMenuOption } from '../OptionsMenu';
import { CardRoot } from './CardRoot';
import { CardHeader } from './CardHeader';
import { Avatar } from '../Avatar';
import { defaultTheme } from '../../theme';
import { Post } from '../../types/post';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import * as Linking from 'expo-linking';
import { Video, ResizeMode } from 'expo-av';
import { getPublicUrl } from '../../lib/storageUrl';
import { canEditPost, canDeleteFeedItem } from '../../utils/permissions';
import type { CommentPreview } from '../../services/likesApi';
import type { CategoryKey } from '../../theme/categories';
import { buildCardBehaviorModel } from './cardBehaviorModel';
import { resolveActorLine, type ProfileMap } from '../../utils/actor';

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
        const hasMediaShape = 'path' in parsed || 'bucket' in parsed || 'type' in parsed || 'url' in parsed || 'uri' in parsed || 'publicUrl' in parsed;
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
    const hasMediaShape = 'path' in raw || 'bucket' in raw || 'type' in raw || 'url' in raw || 'uri' in raw || 'publicUrl' in raw;
    if (__DEV__ && !hasMediaShape) {
      console.warn('[normalizeMedia] Object missing media fields:', Object.keys(raw));
    }
    return hasMediaShape ? [raw] : [];
  }
  
  return [];
}

function normalizeType(typeValue: any): 'image' | 'video' | null {
  if (!typeValue) return null;
  const lower = String(typeValue).toLowerCase();
  // BASELINE: Accept common aliases
  if (lower === 'image' || lower === 'photo' || lower === 'img') return 'image';
  if (lower === 'video' || lower === 'movie') return 'video';
  // BASELINE: Check file extensions
  if (lower.match(/\.(jpg|jpeg|png|heic|webp)$/)) return 'image';
  if (lower.match(/\.(mp4|mov|m4v|webm)$/)) return 'video';
  return null;
}

interface FanPostCardProps {
  post: Post;
  authorProfile?: { display_name: string | null; avatar_url: string | null };
  communityMap?: Record<string, string>;
  profileMap?: ProfileMap;
  categoryKey?: CategoryKey;
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
}

export function FanPostCard({
  post,
  authorProfile,
  communityMap,
  profileMap,
  categoryKey,
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
}: FanPostCardProps) {
  const timeAgo = getTimeAgo(post.createdAt);
  const groupDisplay = post.communityName || post.factionName;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const [imageLoadError, setImageLoadError] = useState(false);

  const { user, isAppAdmin } = useAuth();

  // BASELINE: Deterministic media parsing with DEV logging
  const mediaArray = useMemo(() => normalizeMedia(post.media), [post.media]);
  const m0 = mediaArray[0] || null;
  const mediaKind = normalizeType(m0?.type) || normalizeType((post as any).media_type);

  // BASELINE: Simple URL resolution
  const mediaUri = useMemo(() => {
    if (!m0) return null;
    // Prefer bucket+path (new storage pattern)
    if (m0.bucket && m0.path) {
      return getPublicUrl(m0.bucket, m0.path);
    }
    // Legacy fields
    if (m0.publicUrl) return m0.publicUrl;
    if (m0.url) return m0.url;
    return null;
  }, [m0]);

  // DEV-only logging for first 2 posts
  useEffect(() => {
    if (!__DEV__) return;
    const logKey = `media-debug-${post.id}`;
    const alreadyLogged = (globalThis as any)[logKey];
    if (!alreadyLogged) {
      (globalThis as any)[logKey] = true;
      const logCount = ((globalThis as any).__mediaDebugCount || 0) + 1;
      (globalThis as any).__mediaDebugCount = logCount;
      if (logCount <= 2) {
        console.log('[media-debug]', {
          id: post.id,
          rawType: typeof post.media,
          isArray: Array.isArray(post.media),
          firstMedia: m0,
          kind: mediaKind,
          urlExists: !!mediaUri,
        });
      }
    }
  }, [post.id, post.media, m0, mediaKind, mediaUri]);

  // BASELINE: Remove complex video state management - keep only essential edit handlers

  const deepLink = Linking.createURL(`/post/${post.id}`);
  const handleShare = () => {
    Share.share({ message: `${post.text}\n${deepLink}` }).catch(() => {});
  };

  // Permission checks - use isAppAdmin from context
  // TODO: Add community role when posts have community_id
  const showEditOption = canEditPost(user?.id, isAppAdmin, { author_id: post.authorId });

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
    isAppAdmin,
    viewerUserId: user?.id,
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

  const resolvedCategoryKey = categoryKey ?? 'fan';
  const resolvedAuthor = resolveActorLine({
    actorType: isCommunityPost ? 'community' : 'user',
    authorId: post.authorId,
    authorEmail: authorProfile?.display_name || (post as any).authorName || undefined,
    profileMap,
    communityName: isCommunityPost ? communityName ?? undefined : undefined,
  });
  const headerTitle = cardModel.nameLine ?? resolvedAuthor.displayName;
  const headerSubtitle = isCommunityPost
    ? timeAgo
    : groupDisplay
      ? `${groupDisplay} · ${timeAgo}`
      : timeAgo;

  return (
    <CardRoot
      targetType="post"
      targetId={post.id}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      profileMap={profileMap}
      categoryKey={resolvedCategoryKey}
      onOpenDetail={computedOnOpenDetail}
      commentPreviews={commentPreviews}
      onNewComment={onNewComment}
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
            userId={post.authorId}
            avatarUrl={authorProfile?.avatar_url}
            size={40}
            label={authorProfile?.display_name || post.authorName || 'Fan'}
          />
        }
        nameLine={cardModel.nameLine}
        fallbackTitle={headerTitle}
        subtitle={headerSubtitle}
      />
      {(showEditOption || showDeleteOption) && postMenuOptions.length > 0 ? (
        <OptionsMenu options={postMenuOptions} />
      ) : null}
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
      ) : (
        <Text variant="body" color="primary" style={styles.text}>
          {post.text}
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
                <Text variant="caption" color="secondary" style={{ marginTop: 4 }}>
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
                <Text variant="caption" color="secondary" style={{ marginTop: 4 }}>
                  Type: {mediaKind || 'unknown'}
                  {m0.bucket && m0.path ? ` • ${m0.bucket}/${m0.path}` : ''}
                </Text>
              )}
            </View>
          ) : mediaKind === 'video' ? (
            <View style={styles.mediaContainer}>
              <Video
                source={{ uri: mediaUri }}
                style={styles.video}
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
                useNativeControls
                onError={(e) => {
                  console.error('[VideoError]', { postId: post.id, error: e });
                }}
              />
            </View>
          ) : mediaKind === 'image' ? (
            imageLoadError ? (
              <View style={styles.mediaFallback}>
                <Text variant="caption" color="secondary">
                  Billede kunne ikke indlæses
                </Text>
                {__DEV__ && (
                  <Text variant="caption" color="secondary" style={{ marginTop: 4 }}>
                    {mediaUri}
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.mediaContainer}>
                <Image
                  source={{ uri: mediaUri }}
                  style={styles.image}
                  resizeMode="cover"
                  onError={(e) => {
                    if (__DEV__) {
                      console.log('[ImageError]', {
                        postId: post.id,
                        uri: mediaUri,
                        native: e?.nativeEvent,
                      });
                    }
                    setImageLoadError(true);
                  }}
                />
              </View>
            )
          ) : (
            <View style={styles.mediaFallback}>
              <Text variant="caption" color="secondary">
                Uventet mediaformat
              </Text>
              {__DEV__ && (
                <Text variant="caption" color="secondary" style={{ marginTop: 4 }}>
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

const cardPadding = theme.components.card.padding;

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
  // FULL-BLEED: Media wrapper with negative margins
  mediaOuter: {
    marginHorizontal: -cardPadding,
    marginTop: theme.spacing[3],
    alignSelf: 'stretch',
  },
  // BASELINE: Simple 1:1 media containers - sharp corners
  mediaContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: theme.colors.border.default,
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
