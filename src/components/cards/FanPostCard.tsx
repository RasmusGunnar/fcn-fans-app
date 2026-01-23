import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  Pressable,
  Share,
  Alert,
} from 'react-native';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { OptionsMenu, OptionsMenuOption } from '../OptionsMenu';
import { FeedCardShell } from '../feed/FeedCardShell';
import { FeedCardHeader } from '../FeedCardHeader';
import { Avatar } from '../Avatar';
import { colors, spacing } from '../../theme';
import { Post } from '../../types/post';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import * as Linking from 'expo-linking';
import { normalizeMedia, resolveMediaUrl, isVideoMedia } from '../../utils/media';
import { canEditPost, canDeletePost } from '../../utils/permissions';
import type { CommentPreview } from '../../services/likesApi';

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

  return (
    <FeedCardShell
      targetType="post"
      targetId={post.id}
      currentUserId={user?.id}
      isAppAdmin={isAppAdmin}
      onOpenDetail={onOpenDetail}
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
      <Pill label="Fra Fans" />
      <FeedCardHeader
        avatarSlot={
          <Avatar
            userId={post.authorId}
            avatarUrl={authorProfile?.avatar_url}
            size={40}
            label={authorProfile?.display_name || post.authorName || 'Fan'}
          />
        }
        title={authorProfile?.display_name || post.authorName || 'Ukendt'}
        subtitle={groupDisplay ? `${groupDisplay} · ${timeAgo}` : timeAgo}
        rightSlot={
          (showEditOption || showDeleteOption) && postMenuOptions.length > 0 ? (
            <OptionsMenu options={postMenuOptions} />
          ) : undefined
        }
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
    </FeedCardShell>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  imagePlaceholder: {
    height: 120,
    backgroundColor: colors.border,
    borderRadius: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: spacing.sm,
    backgroundColor: colors.border,
  },
  imageErrorContainer: {
    padding: spacing.sm,
    marginVertical: spacing.xs,
    backgroundColor: colors.border,
    borderRadius: 8,
  },
  imageErrorText: {
    fontSize: 12,
    color: colors.subtext,
    textAlign: 'center',
  },
  videoPlaceholder: {
    height: 120,
    backgroundColor: colors.border,
    borderRadius: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  placeholderText: {
    color: colors.subtext,
    fontSize: 14,
  },
  commentsContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.actionRowBorder,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
  },
  commentBody: { flex: 1 },
  commentText: { color: colors.text, fontSize: 14 },
  commentMeta: { color: colors.subtext, fontSize: 12 },
  commentDelete: {
    color: colors.fcnRed,
    fontSize: 24,
    fontWeight: '700',
  },
  composerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.text,
    fontSize: 14,
  },
  composerSend: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.fcnRed,
    borderRadius: spacing.sm,
  },
  composerSendText: { color: colors.card, fontWeight: '600' },
  editContainer: {
    marginBottom: spacing.md,
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.sm,
    padding: spacing.sm,
    color: colors.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  editButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editButtonSave: {
    backgroundColor: colors.fcnRed,
    borderColor: colors.fcnRed,
  },
  editButtonText: {
    color: colors.card,
    fontWeight: '600',
  },
  editButtonTextCancel: {
    color: colors.text,
  },
  commentDelete: {
    fontSize: 24,
    color: colors.subtext,
    fontWeight: '300',
  },
});
