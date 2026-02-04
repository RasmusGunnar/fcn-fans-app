import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { defaultTheme } from '../../theme';
import { Avatar } from '../Avatar';

export type CommentTargetType = 'post' | 'news' | 'event' | 'match' | 'bus_trip';

interface Comment {
  id: string;
  created_at: string;
  author_id: string;
  text: string;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
}

interface InlineCommentsProps {
  targetType: CommentTargetType;
  targetId: string;
  currentUserId: string | undefined;
  isAppAdmin: boolean;
  onCommentCountChange?: (count: number) => void; // Callback to update parent's comment count
  onNewComment?: (comment: Comment) => void; // Callback when new comment is added
}

export function InlineComments({
  targetType,
  targetId,
  currentUserId,
  isAppAdmin,
  onCommentCountChange,
  onNewComment,
}: InlineCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('comments_v2')
        .select('id, created_at, author_id, text')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: true }); // Latest at bottom for Instagram-style

      if (fetchError) throw fetchError;

      // Fetch author info (display_name, avatar_url) for display
      const commentsWithAuthors = await Promise.all(
        (data || []).map(async (comment) => {
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
            };
          }

          return {
            ...comment,
            author_display_name: profile.display_name || null,
            author_avatar_url: profile.avatar_url || null,
          };
        }),
      );

      setComments(commentsWithAuthors);
    } catch (err: any) {
      console.error('[InlineComments] Fetch error:', err);
      setError('Kunne ikke hente kommentarer');
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    // Notify parent of comment count changes
    if (onCommentCountChange) {
      onCommentCountChange(comments.length);
    }
  }, [comments.length, onCommentCountChange]);

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
        .select('id, created_at, author_id, text')
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

  const getTimeAgo = (isoDate: string): string => {
    const now = new Date();
    const date = new Date(isoDate);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'nu';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}t`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    const theme = defaultTheme;
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Henter kommentarer...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={fetchComments}>
          <Text style={styles.retryText}>Prøv igen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Kommentarer ({comments.length})</Text>
      </View>

      {comments.length === 0 ? (
        <Text style={styles.noCommentsText}>Ingen kommentarer endnu. Vær den første!</Text>
      ) : (
        <View style={styles.commentsList}>
          {comments.map((comment) => {
            const isOwnComment = currentUserId === comment.author_id;
            const canDelete = isOwnComment || isAppAdmin;
            const displayName = isOwnComment ? 'Dig' : comment.author_display_name || 'Ukendt';

            return (
              <View key={comment.id} style={styles.commentItem}>
                <View style={styles.commentRow}>
                  {/* Avatar */}
                  <Avatar
                    userId={comment.author_id}
                    avatarUrl={comment.author_avatar_url}
                    size={32}
                    label={displayName}
                  />

                  {/* Comment content */}
                  <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>{displayName}</Text>
                      <Text style={styles.commentTime}>{getTimeAgo(comment.created_at)}</Text>
                      {canDelete && (
                        <Pressable
                          onPress={() => handleDeleteComment(comment.id, comment.author_id)}
                          hitSlop={8}
                        >
                          <Ionicons
                            name="close-circle"
                            size={16}
                            color={defaultTheme.colors.text.secondary}
                          />
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Skriv en kommentar..."
          placeholderTextColor={defaultTheme.colors.text.secondary}
          value={commentText}
          onChangeText={setCommentText}
          multiline
          maxLength={2000}
          editable={!submitting && !!currentUserId}
        />
        <Pressable
          style={[
            styles.sendButton,
            (!commentText.trim() || submitting) && styles.sendButtonDisabled,
          ]}
          onPress={handleSubmitComment}
          disabled={!commentText.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={defaultTheme.colors.bg.card} />
          ) : (
            <Ionicons name="send" size={18} color={defaultTheme.colors.bg.card} />
          )}
        </Pressable>
      </View>

      {!currentUserId && <Text style={styles.loginPrompt}>Log ind for at kommentere</Text>}
    </View>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.default,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[6],
    backgroundColor: theme.colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.default,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginLeft: theme.spacing[2],
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing[6],
    backgroundColor: theme.colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.default,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginBottom: theme.spacing[2],
  },
  retryText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  header: {
    marginBottom: theme.spacing[3],
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  noCommentsText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
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
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[1],
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginRight: theme.spacing[1],
  },
  commentTime: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    flex: 1,
  },
  commentText: {
    fontSize: 14,
    color: theme.colors.text.primary,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: theme.colors.bg.default,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.border.default,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text.primary,
    maxHeight: 80,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  sendButton: {
    width: 36,
    height: 36,
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
    fontSize: 12,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: theme.spacing[2],
    fontStyle: 'italic',
  },
});
