// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.
// Do not import FeedCardShell directly. Use CardRoot from src/components/cards/CardRoot.tsx

import React, { useState } from 'react';
import { Pressable, StyleSheet, View, Text } from 'react-native';
import { Card } from '../../ui/primitives/Card';
import { CardActions } from '../cards/CardActions';
import { InlineComments, CommentTargetType } from '../comments/InlineComments';
import { defaultTheme } from '../../theme';
import type { CommentPreview } from '../../services/likesApi';
import { targetKey } from '../../utils/targetKey';
import { Avatar } from '../Avatar';

interface FeedCardShellProps {
  targetType: CommentTargetType;
  targetId: string;
  currentUserId: string | undefined;
  isAppAdmin: boolean;
  onOpenDetail?: () => void;
  actions: {
    liked?: boolean;
    likes?: number;
    comments?: number;
    onToggleLike?: () => void;
    onPressShare?: () => void;
  };
  commentPreviews?: CommentPreview[];
  children: React.ReactNode;
  initiallyOpen?: boolean;
  disableInlineComments?: boolean;
  onNewComment?: (comment: CommentPreview) => void;
}

/**
 * Unified feed card shell for all content types (posts, news, events, matches).
 * Handles:
 * - Card wrapper with Pressable for navigation
 * - CardActions (like, comment, share)
 * - Inline comments toggle and rendering
 * - Comment preview display (Instagram style)
 */
// NOTE: Do not import FeedCardShell directly in cards. Use CardRoot from src/components/cards/CardRoot.tsx.
// NOTE: Do not import FeedCardShell directly in card variants.
// Use CardRoot from src/components/cards/CardRoot.tsx.
export function FeedCardShell({
  targetType,
  targetId,
  currentUserId,
  isAppAdmin,
  onOpenDetail,
  actions,
  commentPreviews = [],
  children,
  initiallyOpen = false,
  disableInlineComments = false,
  onNewComment,
}: FeedCardShellProps) {
  const [commentsOpen, setCommentsOpen] = useState(initiallyOpen);

  // Use actions.comments directly from commentCountMap (passed from parent)
  const commentsCount = actions.comments ?? 0;
  const likesCount = actions.likes ?? 0;
  const liked = actions.liked ?? false;

  // Dev log to verify correct data is passed
  if (__DEV__) {
    const key = targetKey(targetType as any, targetId);
    console.log('[FeedCardShell]', { key, commentsCount, likesCount, liked });
  }

  // Helper to get display name for comment author
  const getAuthorDisplayName = (comment: CommentPreview): string => {
    if (comment.author_id === currentUserId) {
      return 'Dig';
    }
    if (comment.author_display_name) {
      return comment.author_display_name;
    }
    return 'Ukendt';
  };

  const handlePressComment = () => {
    if (!disableInlineComments) {
      setCommentsOpen((v) => !v);
    }
  };

  const handleNewComment = (comment: any) => {
    // Notify parent to update both count and preview
    if (onNewComment) {
      onNewComment({
        id: comment.id,
        author_id: comment.author_id,
        text: comment.text,
        created_at: comment.created_at,
        author_display_name: comment.author_display_name,
        author_avatar_url: comment.author_avatar_url,
      });
    }
  };

  const hasComments = commentsCount > 0;
  const showPreview = !commentsOpen && hasComments && commentPreviews.length > 0;

  return (
    <Card style={styles.card}>
      {onOpenDetail ? (
        <Pressable onPress={onOpenDetail} style={styles.pressableContent}>
          {children}
        </Pressable>
      ) : (
        children
      )}

      <CardActions
        liked={liked}
        likes={likesCount}
        comments={commentsCount}
        onToggleLike={actions.onToggleLike || (() => {})}
        onPressComment={handlePressComment}
        onPressShare={actions.onPressShare || (() => {})}
      />

      {showPreview && (
        <View style={styles.previewContainer}>
          <Pressable onPress={handlePressComment}>
            <Text style={styles.viewAllText}>Se alle {commentsCount} kommentarer</Text>
          </Pressable>
          {commentPreviews.map((comment) => {
            const displayName = getAuthorDisplayName(comment);

            return (
              <View key={comment.id} style={styles.previewComment}>
                <Avatar
                  userId={comment.author_id}
                  avatarUrl={comment.author_avatar_url}
                  size={24}
                  label={displayName}
                />
                <View style={styles.previewTextContainer}>
                  <Text style={styles.previewAuthor}>{displayName}</Text>
                  <Text style={styles.previewText}> {comment.text}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {commentsOpen && !disableInlineComments && (
        <InlineComments
          targetType={targetType}
          targetId={targetId}
          currentUserId={currentUserId}
          isAppAdmin={isAppAdmin}
          onNewComment={handleNewComment}
        />
      )}
    </Card>
  );
}

const theme = defaultTheme;

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.layout.listGap,
  },
  pressableContent: {
    // Allows tapping card content to navigate
  },
  previewContainer: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  viewAllText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing[1],
  },
  previewComment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing[1],
    gap: theme.spacing[1],
  },
  previewTextContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  previewAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  previewText: {
    fontSize: 13,
    color: theme.colors.text.primary,
  },
});
