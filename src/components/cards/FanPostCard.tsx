import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Image, TextInput, Pressable, LayoutAnimation, Share } from 'react-native';
import { Card } from '../ui/Card';
import { Pill } from '../ui/Pill';
import { CardActions } from './CardActions';
import { colors, spacing } from '../../theme';
import { Post } from '../../types/post';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import * as Linking from 'expo-linking';
import { normalizeMedia, resolveMediaUrl, isVideoMedia } from '../../utils/media';

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
  liked?: boolean;
  onToggleLike?: () => void;
  onPressComment?: () => void;
  onPressShare?: () => void;
}

export function FanPostCard({
  post,
  liked = post.likedByMe,
  onToggleLike = () => {},
  onPressComment = () => {},
  onPressShare = () => {},
}: FanPostCardProps) {
  const timeAgo = getTimeAgo(post.createdAt);
  const groupDisplay = post.communityName || post.factionName;
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Array<{ id: string; text: string; author_name?: string; created_at: string }>>([]);
  const [composer, setComposer] = useState('');

  const { user } = useAuth();

  // Normalize media and extract image URL using centralized helpers
  // Memoize to avoid redundant normalizeMedia and resolveMediaUrl calls on re-renders
  const mediaArr = useMemo(() => normalizeMedia(post.media), [post.media]);
  const firstMedia = useMemo(() => mediaArr[0], [mediaArr]);
  const imageUrl = useMemo(() => resolveMediaUrl(firstMedia), [firstMedia]);
  const isVideo = useMemo(() => isVideoMedia(firstMedia), [firstMedia]);
  useEffect(() => {
    let mounted = true;
    if (!expanded) return;
    (async () => {
      const { data, error } = await supabase.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: true });
      if (error) { console.warn('Load comments error', error); return; }
      if (mounted) setComments(data || []);
    })();
    return () => { mounted = false; };
  }, [expanded, post.id]);

  const submitComment = async () => {
    if (!composer.trim()) return;
    const optimistic = { id: Math.random().toString(36), text: composer.trim(), created_at: new Date().toISOString() };
    setComments((prev) => [...prev, optimistic]);
    setComposer('');
    const { error } = await supabase.from('comments').insert({ post_id: post.id, text: optimistic.text, author_id: user?.id });
    if (error) console.warn('Insert comment error', error);
    try {
      if (post.authorId && post.authorId !== user?.id) {
        await supabase.functions.invoke('send-push', {
          body: { toUserId: post.authorId, title: 'Ny kommentar', body: 'Der er en ny kommentar på dit opslag', data: { postId: post.id } },
        });
      }
    } catch (e) { /* ignore */ }
  };

  const handlePressComment = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  const deepLink = Linking.createURL(`/post/${post.id}`);
  const handleShare = () => {
    Share.share({ message: `${post.text}\n${deepLink}` }).catch(() => {});
  };
  return (
    <Card style={styles.card}>
      <Pill label="Fra Fans" />
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.authorName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{post.authorName}</Text>
          {groupDisplay && <Text style={styles.group}>{groupDisplay}</Text>}
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
      </View>
      <Text style={styles.text}>{post.text}</Text>
      {isVideo ? (
        <View style={styles.videoPlaceholder}>
          <Text style={styles.placeholderText}>Video vedhæftet</Text>
        </View>
      ) : imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          resizeMode="cover"
          onError={(error) => {
            if (__DEV__) {
              console.warn('[FanPostCard] Image load error:', { postId: post.id, imageUrl, error });
            }
          }}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>Billede placeholder</Text>
        </View>
      )}
      <CardActions
        liked={liked}
        likes={post.likesCount}
        comments={post.commentsCount}
        onToggleLike={onToggleLike}
        onPressComment={handlePressComment}
        onPressShare={handleShare}
      />
      {expanded && (
        <View style={styles.commentsContainer}>
          {comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <View style={styles.commentAvatar} />
              <View style={styles.commentBody}>
                <Text style={styles.commentText}>{c.text}</Text>
                <Text style={styles.commentMeta}>{getTimeAgo(c.created_at)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.composerRow}>
            <TextInput
              style={styles.composerInput}
              placeholder="Skriv en kommentar"
              placeholderTextColor={colors.subtext}
              value={composer}
              onChangeText={setComposer}
            />
            <Pressable style={styles.composerSend} onPress={submitComment}>
              <Text style={styles.composerSendText}>Send</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fcnRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  group: {
    fontSize: 12,
    color: colors.subtext,
  },
  timeAgo: {
    fontSize: 12,
    color: colors.subtext,
  },
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
});