// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Image, TextInput, Pressable, Share, Alert } from 'react-native';
import { Card } from '../ui/Card';
import { OptionsMenu, OptionsMenuOption } from '../OptionsMenu';
import { CardRoot } from './CardRoot';
import { Pill } from '../ui/Pill';
import { FeedCardHeader } from '../FeedCardHeader';
import { Avatar } from '../Avatar';
import { defaultTheme } from '../../theme';
import { Post } from '../../types/post';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import * as Linking from 'expo-linking';
import { normalizeMedia, resolveMediaUrl, isVideoMedia } from '../../utils/media';
import { canEditPost, canDeletePost } from '../../utils/permissions';
import type { CommentPreview } from '../../services/likesApi';
import { buildCardBehaviorModel } from './cardBehaviorModel';

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
  authorProfile?: { display_name: string | null; avatar_url: string | null };
  communityMap?: Record<string, string>;
  liked?: boolean;
  likes?: number;
  commentsCount?: number;
  commentPreviews?: CommentPreview[];
  onToggleLike?: () => void;
  onPressShare?: () => void;
  onDeleted?: (postId: string) => void;
  onOpenDetail?: () => void; // Optional navigation to post detail
  onNewComment?: (comment: CommentPreview) => void;
}

export function FanPostCard({
  post,
  authorProfile,
  communityMap,
  liked = post.likedByMe,
  likes = post.likesCount,
  commentsCount = 0,
  commentPreviews = [],
  onToggleLike = () => {},
  onPressShare = () => {},
  onDeleted = () => {},
  onOpenDetail,
  onNewComment,
}: FanPostCardProps) {
  const timeAgo = getTimeAgo(post.createdAt);
  const groupDisplay = post.communityName || post.factionName;
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const [imageLoadError, setImageLoadError] = useState(false);

  const { user, isAppAdmin } = useAuth();

  // Normalize media and extract image URL using centralized helpers
  // Memoize to avoid redundant normalizeMedia and resolveMediaUrl calls on re-renders
  const mediaArr = useMemo(() => normalizeMedia(post.media), [post.media]);
  const firstMedia = useMemo(() => mediaArr[0], [mediaArr]);
  const imageUrl = useMemo(() => resolveMediaUrl(firstMedia), [firstMedia]);
  const isVideo = useMemo(() => isVideoMedia(firstMedia), [firstMedia]);

  // Debug logging for resolved media URL
  if (__DEV__ && imageUrl) {
    console.log('[PostImageUri]', { postId: post.id, uri: imageUrl });
  }

  const deepLink = Linking.createURL(`/post/${post.id}`);
  const handleShare = () => {
    Share.share({ message: `${post.text}\n${deepLink}` }).catch(() => {});
  };

  // Permission checks - use isAppAdmin from context
  // TODO: Add community role when posts have community_id
  const showEditOption = canEditPost(user?.id, isAppAdmin, { author_id: post.authorId });
  const showDeleteOption = canDeletePost(user?.id, isAppAdmin, { author_id: post.authorId });

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

  // Debug logging for menu visibility and author
  if (__DEV__) {
    console.log('[PostAuthor]', {
      postId: post.id.substring(0, 8),
      authorId: post.authorId?.substring(0, 8) || 'none',
      display_name: authorProfile?.display_name,
      avatar_url: authorProfile?.avatar_url,
    });
    console.log('[FanPostCard] Render post:', post.id.substring(0, 8), {
      isAppAdmin,
      showEdit: showEditOption,
      showDelete: showDeleteOption,
      menuCount: postMenuOptions.length,
      authorId: post.authorId?.substring(0, 8) || 'none',
      userId: user?.id?.substring(0, 8) || 'none',
      likes,
      liked,
    });
  }

  // Build card behavior model to determine category, name line, and press behavior
  const communityId = (post as any).communityId ?? (post as any).community_id ?? null;
  const isCommunityPost = !!communityId;
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

  return (
    <CardRoot
      targetType="post"
      targetId={post.id}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
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
      <Pill label={cardModel.categoryLabel} />
      {cardModel.nameLine ? (
        <FeedCardHeader
          avatarSlot={
            <Avatar
              userId={post.authorId}
              avatarUrl={authorProfile?.avatar_url}
              size={40}
              label={authorProfile?.display_name || post.authorName || 'Fan'}
            />
          }
          title={cardModel.nameLine}
          subtitle={groupDisplay ? `${groupDisplay} · ${timeAgo}` : timeAgo}
        />
      ) : null}
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
              <Text style={styles.editButtonTextCancel}>Annuller</Text>
            </Pressable>
            <Pressable style={[styles.editButton, styles.editButtonSave]} onPress={handleSaveEdit}>
              <Text style={styles.editButtonText}>Gem</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.text}>{post.text}</Text>
      )}
      {isVideo ? (
        <View style={styles.videoPlaceholder}>
          <Text style={styles.placeholderText}>Video vedhæftet</Text>
        </View>
      ) : imageUrl && !imageLoadError ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
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
      ) : imageLoadError && __DEV__ ? (
        <View style={styles.imageErrorContainer}>
          <Text style={styles.imageErrorText}>⚠️ Billede kunne ikke indlæses</Text>
        </View>
      ) : null}
    </CardRoot>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    color: theme.colors.text.primary,
    lineHeight: 20,
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
  image: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing[2],
    backgroundColor: theme.colors.border.default,
  },
  imageErrorContainer: {
    padding: theme.spacing[2],
    marginVertical: theme.spacing[1],
    backgroundColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
  },
  imageErrorText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
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
  placeholderText: {
    color: theme.colors.text.secondary,
    fontSize: 14,
  },
  commentsContainer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.light,
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
  commentText: { color: theme.colors.text.primary, fontSize: 14 },
  commentMeta: { color: theme.colors.text.secondary, fontSize: 12 },
  commentDelete: {
    color: theme.colors.primary,
    fontSize: 24,
    fontWeight: '700',
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
    fontSize: 14,
  },
  composerSend: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
  },
  composerSendText: { color: theme.colors.bg.card, fontWeight: '600' },
  editContainer: {
    marginBottom: theme.spacing[3],
  },
  editInput: {
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.sm,
    padding: theme.spacing[2],
    color: theme.colors.text.primary,
    fontSize: 14,
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
    fontWeight: '600',
  },
  editButtonTextCancel: {
    color: theme.colors.text.primary,
  },
});
