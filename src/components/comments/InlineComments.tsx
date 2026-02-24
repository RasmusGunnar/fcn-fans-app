import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  FlatList,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { defaultTheme } from '../../theme';
import { Avatar } from '../Avatar';
import { Text } from '../ui';
import { resolveActorLine, type ProfileMap } from '../../utils/actor';
import { toggleCommentLike, type CommentReplyRecord } from '../../services/commentsApi';
import type { CommentPreview } from '../../services/likesApi';

export type CommentTargetType = 'post' | 'news' | 'event' | 'match' | 'bus_trip';

interface CommentReply extends CommentReplyRecord {
  likeCount: number;
  likedByMe: boolean;
}

interface Comment extends CommentReply {
  replies: CommentReply[];
}

interface CommentRecord extends CommentReply {
  parent_id: string | null;
}

interface InlineCommentsProps {
  targetType: CommentTargetType;
  targetId: string;
  currentUserId: string | undefined;
  isAppAdmin: boolean;
  profileMap?: ProfileMap;
  onCommentCountChange?: (count: number) => void; // Callback to update parent's comment count
  onNewComment?: (comment: CommentPreview) => void; // Callback when new comment is added
  variant?: 'inline' | 'screen'; // Default 'inline'
  maxInlineComments?: number; // Default 2 for inline mode
  keyboardVerticalOffsetOverride?: number; // For screen mode keyboard handling
}

export function InlineComments({
  targetType,
  targetId,
  currentUserId,
  isAppAdmin,
  profileMap,
  onCommentCountChange,
  onNewComment,
  variant = 'inline',
  maxInlineComments = 2,
  keyboardVerticalOffsetOverride,
}: InlineCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeReplyToCommentId, setActiveReplyToCommentId] = useState<string | null>(null);
  const [activeReplyToDisplayName, setActiveReplyToDisplayName] = useState<string | null>(null);
  const [expandedReplyIds, setExpandedReplyIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<TextInput | null>(null);
  const listRef = useRef<FlatList<Comment> | null>(null);
  const commentPositions = useRef<Record<string, number>>({});
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const keyboardVerticalOffset =
    variant === 'screen' ? (keyboardVerticalOffsetOverride ?? insets.top + 44) : 0;

  const resolveActor = useCallback(
    (authorId: string, authorDisplayName?: string | null, authorAvatarUrl?: string | null) => {
      const resolved = resolveActorLine({
        actorType: 'user',
        authorId,
        authorEmail: authorDisplayName ?? undefined,
        profileMap,
      });

      return {
        displayName: resolved.displayName,
        avatarUrl: resolved.avatarUrl ?? authorAvatarUrl ?? null,
      };
    },
    [profileMap],
  );

  const groupComments = useCallback((records: CommentRecord[]): Comment[] => {
    const repliesByParent: Record<string, CommentReply[]> = {};
    const parents: CommentReply[] = [];

    records.forEach((record) => {
      const { parent_id, ...rest } = record;
      if (parent_id) {
        if (!repliesByParent[parent_id]) {
          repliesByParent[parent_id] = [];
        }
        repliesByParent[parent_id].push(rest);
      } else {
        parents.push(rest);
      }
    });

    const sortedParents = parents.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return sortedParents.map((parent) => {
      const replies = repliesByParent[parent.id] ?? [];
      const sortedReplies = replies.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      return {
        ...parent,
        replies: sortedReplies,
      };
    });
  }, []);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('comments_v2')
        .select('id, created_at, author_id, text, parent_id')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: true }); // Latest at bottom for Instagram-style

      if (fetchError) throw fetchError;

      // Fetch author info (display_name, avatar_url) for display
      const rows = (data || []) as CommentRecord[];
      const commentsWithAuthors = await Promise.all(
        rows.map(async (comment) => {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .eq('id', comment.author_id)
            .single();

          if (__DEV__ && profileError) {
            console.warn(
              `[InlineComments] Profile fetch error for ${comment.author_id.substring(0, 8)}:`,
              profileError.message,
            );
          }

          // Guard against undefined profile
          if (!profile) {
            return {
              ...comment,
              author_display_name: null,
              author_avatar_url: null,
              likeCount: 0,
              likedByMe: false,
            };
          }

          return {
            ...comment,
            author_display_name: profile.display_name || null,
            author_avatar_url: profile.avatar_url || null,
            likeCount: 0,
            likedByMe: false,
          };
        }),
      );

      setComments(groupComments(commentsWithAuthors));
    } catch (err: any) {
      console.error('[InlineComments] Fetch error:', err);
      setError('Kunne ikke hente kommentarer');
    } finally {
      setLoading(false);
    }
  }, [groupComments, targetType, targetId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const totalCommentCount = comments.reduce(
    (total, comment) => total + 1 + comment.replies.length,
    0,
  );

  useEffect(() => {
    // Notify parent of comment count changes
    if (onCommentCountChange) {
      onCommentCountChange(totalCommentCount);
    }
  }, [onCommentCountChange, totalCommentCount]);

  const handleSubmitComment = async () => {
    if (!commentText.trim()) {
      Alert.alert('Fejl', 'Kommentar kan ikke være tom');
      return;
    }

    if (!currentUserId) {
      Alert.alert('Fejl', 'Du skal være logget ind for at kommentere');
      return;
    }

    setSubmitting(true);

    try {
      const { data, error: insertError } = await supabase
        .from('comments_v2')
        .insert({
          author_id: currentUserId,
          target_type: targetType,
          target_id: targetId,
          text: commentText.trim(),
        })
        .select('id, created_at, author_id, text, parent_id')
        .single();

      if (insertError) throw insertError;

      // Fetch author info for the new comment (display_name, avatar_url)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', currentUserId)
        .single();

      const newComment: Comment = {
        ...data,
        author_display_name: profile?.display_name || null,
        author_avatar_url: profile?.avatar_url || null,
        likeCount: 0,
        likedByMe: false,
        replies: [],
      };

      setComments([...comments, newComment]); // Add to bottom (Instagram-style)
      setCommentText('');

      // Notify parent of new comment for preview update
      if (onNewComment) {
        onNewComment(newComment);
      }
    } catch (err: any) {
      console.error('[InlineComments] Submit error:', err);
      Alert.alert('Fejl', 'Kunne ikke sende kommentar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string, authorId: string) => {
    const canDelete = currentUserId === authorId || isAppAdmin;

    if (!canDelete) {
      Alert.alert('Fejl', 'Du kan ikke slette denne kommentar');
      return;
    }

    Alert.alert('Slet kommentar', 'Er du sikker?', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Slet',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error: deleteError } = await supabase
              .from('comments_v2')
              .delete()
              .eq('id', commentId);

            if (deleteError) throw deleteError;

            setComments(comments.filter((c) => c.id !== commentId));
          } catch (err: any) {
            console.error('[InlineComments] Delete error:', err);
            Alert.alert('Fejl', 'Kunne ikke slette kommentar');
          }
        },
      },
    ]);
  };

  const handleToggleCommentLike = async (commentId: string) => {
    if (!currentUserId) {
      Alert.alert('Fejl', 'Du skal være logget ind for at like en kommentar');
      return;
    }

    const previous = comments;
    const updated = comments.map((comment) => {
      if (comment.id !== commentId) return comment;
      const nextLiked = !comment.likedByMe;
      const nextCount = Math.max(0, comment.likeCount + (nextLiked ? 1 : -1));
      return { ...comment, likedByMe: nextLiked, likeCount: nextCount };
    });
    setComments(updated);

    const target = updated.find((comment) => comment.id === commentId);
    if (!target) return;

    const ok = await toggleCommentLike({
      commentId,
      userId: currentUserId,
      willLike: target.likedByMe,
    });

    if (!ok) {
      setComments(previous);
    }
  };

  const handleStartReply = (parentCommentId: string, displayName: string, scrollToId?: string) => {
    setActiveReplyToCommentId(parentCommentId);
    setActiveReplyToDisplayName(displayName);
    inputRef.current?.focus();
    const positionY = commentPositions.current[scrollToId ?? parentCommentId];
    if (typeof positionY === 'number') {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, positionY - theme.spacing[6]),
          animated: true,
        });
      });
    }
  };

  const handleCancelReply = () => {
    setActiveReplyToCommentId(null);
    setActiveReplyToDisplayName(null);
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplyIds((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const formatRepliesToggleLabel = (replyCount: number, isExpanded: boolean) => {
    if (isExpanded) return 'Skjul svar';
    return replyCount === 1 ? 'Vis 1 svar' : `Vis ${replyCount} svar`;
  };

  const handleSubmitReply = async (commentId: string) => {
    if (!commentText.trim()) {
      Alert.alert('Fejl', 'Svar kan ikke være tom');
      return;
    }
    if (!currentUserId) {
      Alert.alert('Fejl', 'Du skal være logget ind for at svare');
      return;
    }

    setSubmitting(true);

    const resolved = resolveActor(currentUserId, undefined, undefined);
    const optimisticReply: CommentReply = {
      id: `local-${Date.now()}`,
      created_at: new Date().toISOString(),
      author_id: currentUserId,
      text: commentText.trim(),
      author_display_name: resolved.displayName,
      author_avatar_url: resolved.avatarUrl ?? null,
      likeCount: 0,
      likedByMe: false,
    };

    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, replies: [...comment.replies, optimisticReply] }
          : comment,
      ),
    );
    setExpandedReplyIds((prev) => new Set(prev).add(commentId));

    setCommentText('');
    handleCancelReply();

    try {
      const { data: savedReply, error: insertError } = await supabase
        .from('comments_v2')
        .insert({
          author_id: currentUserId,
          target_type: targetType,
          target_id: targetId,
          parent_id: commentId,
          text: optimisticReply.text,
        })
        .select('id, created_at, author_id, text, parent_id')
        .single();

      if (insertError || !savedReply) {
        throw insertError ?? new Error('Reply insert failed');
      }

      setComments((prev) =>
        prev.map((comment) => {
          if (comment.id !== commentId) return comment;
          const nextReplies = comment.replies.map((reply) =>
            reply.id === optimisticReply.id
              ? {
                  ...reply,
                  id: savedReply.id,
                  created_at: savedReply.created_at,
                }
              : reply,
          );
          return { ...comment, replies: nextReplies };
        }),
      );
    } catch (err) {
      console.error('[InlineComments] Reply submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitComposer = () => {
    if (activeReplyToCommentId) {
      handleSubmitReply(activeReplyToCommentId);
      return;
    }
    handleSubmitComment();
  };

  const getTimeAgo = (isoDate: string): string => {
    const now = new Date();
    const date = new Date(isoDate);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Lige nu';
    if (diffMins < 60) return `${diffMins} minut${diffMins === 1 ? '' : 'ter'} siden`;
    if (diffHours < 24) return `${diffHours} time${diffHours === 1 ? '' : 'r'} siden`;
    if (diffDays < 7) return `${diffDays} dag${diffDays === 1 ? '' : 'e'} siden`;
    return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  };

  const renderCommentItem = (comment: Comment) => {
    const isOwnComment = currentUserId === comment.author_id;
    const canDelete = isOwnComment || isAppAdmin;
    const resolvedAuthor = resolveActor(
      comment.author_id,
      comment.author_display_name,
      comment.author_avatar_url,
    );
    const replyCount = comment.replies.length;
    const repliesExpanded = expandedReplyIds.has(comment.id);

    return (
      <View
        key={comment.id}
        style={styles.commentItem}
        onLayout={(event) => {
          commentPositions.current[comment.id] = event.nativeEvent.layout.y;
        }}
      >
        <View style={styles.commentRow}>
          <Pressable
            onPress={() => navigation.navigate('PublicProfile', { userId: comment.author_id })}
          >
            <View style={styles.commentAvatarWrap}>
              <Avatar
                userId={comment.author_id}
                avatarUrl={resolvedAuthor.avatarUrl}
                size={32}
                label={resolvedAuthor.displayName}
              />
            </View>
          </Pressable>

          <View style={styles.commentBody}>
            <View style={styles.commentHeaderRow}>
              <View style={styles.commentHeaderText}>
                <Pressable
                  onPress={() =>
                    navigation.navigate('PublicProfile', { userId: comment.author_id })
                  }
                >
                  <Text variant="caption" color="primary" style={styles.commentAuthor}>
                    {resolvedAuthor.displayName}
                  </Text>
                </Pressable>
                <Text variant="caption" color="secondary" style={styles.commentTime}>
                  {getTimeAgo(comment.created_at)}
                </Text>
              </View>
              <Pressable
                onPress={() => handleToggleCommentLike(comment.id)}
                hitSlop={theme.spacing[2]}
                style={styles.commentLikeButton}
              >
                <Ionicons
                  name={comment.likedByMe ? 'heart' : 'heart-outline'}
                  size={theme.spacing[5]}
                  color={comment.likedByMe ? theme.colors.primary : theme.colors.text.muted}
                />
                {comment.likeCount > 0 ? (
                  <Text variant="caption" color={comment.likedByMe ? 'primary' : 'muted'}>
                    {comment.likeCount}
                  </Text>
                ) : null}
              </Pressable>
            </View>

            <Text variant="body" color="primary" style={styles.commentText}>
              {comment.text}
            </Text>

            <View style={styles.commentMetaRow}>
              <Pressable onPress={() => handleStartReply(comment.id, resolvedAuthor.displayName)}>
                <Text variant="caption" color="secondary" style={styles.replyAction}>
                  Svar
                </Text>
              </Pressable>
              {canDelete ? (
                <Pressable
                  onPress={() => handleDeleteComment(comment.id, comment.author_id)}
                  hitSlop={theme.spacing[2]}
                >
                  <Ionicons
                    name="close-circle"
                    size={theme.spacing[5]}
                    color={theme.colors.text.secondary}
                  />
                </Pressable>
              ) : null}
            </View>

            {replyCount > 0 ? (
              <Pressable style={styles.replyToggleRow} onPress={() => toggleReplies(comment.id)}>
                <Text variant="caption" color="secondary" style={styles.replyToggleText}>
                  {formatRepliesToggleLabel(replyCount, repliesExpanded)}
                </Text>
              </Pressable>
            ) : null}

            {replyCount > 0 && repliesExpanded ? (
              <View style={styles.repliesList}>
                {comment.replies.map((reply) => {
                  const resolvedReply = resolveActor(
                    reply.author_id,
                    reply.author_display_name,
                    reply.author_avatar_url,
                  );
                  return (
                    <View key={reply.id} style={styles.replyRow}>
                      <Pressable
                        onPress={() =>
                          navigation.navigate('PublicProfile', { userId: reply.author_id })
                        }
                      >
                        <View style={styles.replyAvatarWrap}>
                          <Avatar
                            userId={reply.author_id}
                            avatarUrl={resolvedReply.avatarUrl}
                            size={26}
                            label={resolvedReply.displayName}
                          />
                        </View>
                      </Pressable>
                      <View style={styles.replyContent}>
                        <View style={styles.replyHeaderRow}>
                          <Pressable
                            onPress={() =>
                              navigation.navigate('PublicProfile', { userId: reply.author_id })
                            }
                          >
                            <Text variant="caption" color="primary" style={styles.replyAuthor}>
                              {resolvedReply.displayName}
                            </Text>
                          </Pressable>
                          <Text variant="caption" color="secondary" style={styles.replyTime}>
                            {getTimeAgo(reply.created_at)}
                          </Text>
                        </View>
                        <Text variant="body" color="primary" style={styles.replyText}>
                          {reply.text}
                        </Text>
                        <View style={styles.replyMetaRow}>
                          <Pressable
                            onPress={() =>
                              handleStartReply(comment.id, resolvedReply.displayName, comment.id)
                            }
                          >
                            <Text variant="caption" color="secondary" style={styles.replyAction}>
                              Svar
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const commentsToDisplay = variant === 'inline' ? comments.slice(0, maxInlineComments) : comments;

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text variant="caption" color="secondary" style={styles.loadingText}>
            Henter kommentarer...
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text variant="caption" color="error" style={styles.errorText}>
            {error}
          </Text>
          <Pressable onPress={fetchComments}>
            <Text variant="caption" color="primary" style={styles.retryText}>
              Prøv igen
            </Text>
          </Pressable>
        </View>
      );
    }

    if (variant === 'screen') {
      return (
        <FlatList
          ref={listRef}
          data={comments}
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          keyExtractor={(comment) => comment.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentInsetAdjustmentBehavior="automatic"
          onScrollBeginDrag={Keyboard.dismiss}
          ListEmptyComponent={
            <Text variant="body" color="secondary" style={styles.noCommentsText}>
              Ingen kommentarer endnu. Vær den første!
            </Text>
          }
          renderItem={({ item }) => renderCommentItem(item)}
        />
      );
    }

    // Inline mode - no FlatList, use map()
    return (
      <View style={styles.commentsList}>
        {comments.length === 0 ? (
          <Text variant="body" color="secondary" style={styles.noCommentsText}>
            Ingen kommentarer endnu. Vær den første!
          </Text>
        ) : (
          <>
            {commentsToDisplay.map((comment) => renderCommentItem(comment))}
            {comments.length > maxInlineComments && (
              <Pressable style={styles.showAllCommentsButton}>
                <Text variant="caption" color="primary" style={styles.showAllCommentsText}>
                  Se alle {totalCommentCount} kommentarer
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    );
  };

  const rootContent = (
    <>
      <View style={styles.header}>
        <Text variant="caption" color="primary" style={styles.headerText}>
          Kommentarer ({totalCommentCount})
        </Text>
      </View>

      {renderContent()}

      {activeReplyToCommentId ? (
        <View style={styles.slimReplyBar}>
          <Text variant="caption" color="secondary" style={styles.slimReplyText}>
            Svarer til {activeReplyToDisplayName ?? 'Ukendt'}
          </Text>
          <Pressable onPress={handleCancelReply} hitSlop={theme.spacing[2]}>
            <Ionicons name="close" size={theme.spacing[5]} color={theme.colors.text.secondary} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.composerContainer, { paddingBottom: theme.spacing[2] + insets.bottom }]}>
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={activeReplyToCommentId ? 'Skriv et svar...' : 'Skriv en kommentar...'}
            placeholderTextColor={defaultTheme.colors.text.secondary}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={2000}
            editable={!submitting && !!currentUserId}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (commentText.trim()) {
                handleSubmitComposer();
              }
            }}
          />
          <Pressable
            style={[
              styles.sendButton,
              (!commentText.trim() || submitting) && styles.sendButtonDisabled,
            ]}
            onPress={handleSubmitComposer}
            disabled={!commentText.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={defaultTheme.colors.bg.card} />
            ) : (
              <Ionicons name="send" size={theme.spacing[5]} color={defaultTheme.colors.bg.card} />
            )}
          </Pressable>
        </View>

        {!currentUserId && (
          <Text variant="caption" color="secondary" style={styles.loginPrompt}>
            Log ind for at kommentere
          </Text>
        )}
      </View>
    </>
  );

  if (variant === 'screen') {
    return (
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <View style={styles.root}>
          <Pressable style={styles.pressableArea} onPress={Keyboard.dismiss}>
            {rootContent}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Inline mode - no KeyboardAvoidingView to avoid nesting warnings
  return (
    <View style={styles.root}>
      <Pressable style={styles.pressableArea} onPress={Keyboard.dismiss}>
        {rootContent}
      </Pressable>
    </View>
  );
}

const theme = defaultTheme;
const commentsInset = theme.spacing[3];

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg.card,
    borderTopWidth: theme.layout.borderHairline,
    borderTopColor: theme.colors.border.subtle,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  pressableArea: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: commentsInset,
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[12] + theme.spacing[4],
    flexGrow: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: commentsInset,
    paddingVertical: theme.spacing[6],
    backgroundColor: theme.colors.bg.card,
    borderTopWidth: theme.layout.borderHairline,
    borderTopColor: theme.colors.border.subtle,
  },
  loadingText: {
    marginLeft: theme.spacing[2],
  },
  errorContainer: {
    alignItems: 'center',
    paddingHorizontal: commentsInset,
    paddingVertical: theme.spacing[6],
    backgroundColor: theme.colors.bg.card,
    borderTopWidth: theme.layout.borderHairline,
    borderTopColor: theme.colors.border.subtle,
  },
  errorText: {
    marginBottom: theme.spacing[2],
  },
  retryText: {
    fontWeight: theme.typography.caption.fontWeight as any,
  },
  header: {
    paddingHorizontal: commentsInset,
    paddingTop: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  headerText: {
    fontWeight: theme.typography.caption.fontWeight as any,
  },
  noCommentsText: {
    textAlign: 'center',
    paddingVertical: theme.spacing[3],
    fontStyle: 'italic',
  },
  commentsList: {
    marginBottom: theme.spacing[3],
  },
  commentItem: {
    marginBottom: theme.spacing[3],
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[2],
  },
  commentAvatarWrap: {
    alignSelf: 'flex-start',
  },
  commentBody: {
    flex: 1,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  commentHeaderText: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing[0],
  },
  commentAuthor: {
    fontWeight: theme.typography.caption.fontWeight as any,
  },
  commentTime: {},
  commentLikeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    paddingLeft: theme.spacing[1],
  },
  commentText: {
    marginTop: theme.spacing[1],
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  replyMetaRow: {
    marginTop: theme.spacing[1],
  },
  showAllCommentsButton: {
    paddingVertical: theme.spacing[2],
    alignItems: 'center',
  },
  showAllCommentsText: {
    fontWeight: theme.typography.caption.fontWeight as any,
  },
  replyAction: {
    fontWeight: theme.typography.caption.fontWeight as any,
  },
  slimReplyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bg.subtle,
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  slimReplyText: {
    flex: 1,
  },
  replyToggleRow: {
    marginTop: theme.spacing[1],
  },
  replyToggleText: {
    fontWeight: theme.typography.caption.fontWeight as any,
  },
  repliesList: {
    marginTop: theme.spacing[2],
    paddingLeft: theme.spacing[10],
    gap: theme.spacing[1],
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[1],
  },
  replyAvatarWrap: {
    alignSelf: 'flex-start',
  },
  replyContent: {
    flex: 1,
  },
  replyHeaderRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: theme.spacing[0],
  },
  replyAuthor: {
    fontWeight: theme.typography.caption.fontWeight as any,
  },
  replyTime: {},
  replyText: {
    marginTop: theme.spacing[1],
  },
  composerContainer: {
    paddingHorizontal: commentsInset,
    paddingTop: theme.spacing[2],
    backgroundColor: theme.colors.bg.card,
    borderTopWidth: theme.layout.borderHairline,
    borderTopColor: theme.colors.border.subtle,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: theme.colors.bg.default,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
  },
  input: {
    flex: 1,
    maxHeight: theme.spacing[12],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  sendButton: {
    width: theme.spacing[10],
    height: theme.spacing[10],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing[1],
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.text.secondary,
    opacity: 0.5,
  },
  loginPrompt: {
    textAlign: 'center',
    marginTop: theme.spacing[2],
    fontStyle: 'italic',
  },
});
