// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CommentPreview } from '../../services/likesApi';
import { defaultTheme } from '../../theme';
import type { ProfileMap } from '../../utils/actor';
import { renderTextWithEntities } from '../../utils/renderTextWithEntities';
import { Avatar } from '../Avatar';
import { CardActions } from '../cards/CardActions';
import { CommentTargetType, InlineComments } from '../comments/InlineComments';
import { Card } from '../ui/Card';

/** Horizontal content padding inside feed cards. Use negative margin for full-bleed media. */
export const contentPaddingX = defaultTheme.layout.cardPadding;

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
  maxInlineComments?: number;
  onNewComment?: (comment: CommentPreview) => void;
  profileMap?: ProfileMap;
}

/**
 * Unified feed card shell for all content types (posts, news, events, matches).
 * Handles:
 * - Card wrapper with Pressable for navigation
 * - CardActions (like, comment, share)
 * - Inline comments toggle and rendering
 * - Comment preview display (Instagram style)
 */
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
  maxInlineComments = 2,
  onNewComment,
  profileMap,
}: FeedCardShellProps) {
  const [commentsOpen, setCommentsOpen] = useState(initiallyOpen);

  // Use actions.comments directly from commentCountMap (passed from parent)
  const commentsCount = actions.comments ?? 0;
  const likesCount = actions.likes ?? 0;
  const liked = actions.liked ?? false;
  const hasComments = commentsCount > 0;
  const showPreview = !commentsOpen && hasComments && commentPreviews.length > 0;
  const mentionLabels = useMemo(() => {
    if (!commentsOpen && !showPreview) {
      return {};
    }

    return Object.fromEntries(
      Object.values(profileMap ?? {})
        .filter(
          (profile) =>
            typeof profile.username === 'string' &&
            profile.username.trim().length > 0 &&
            typeof profile.display_name === 'string' &&
            profile.display_name.trim().length > 0,
        )
        .map((profile) => [profile.username!.toLowerCase(), profile.display_name!.trim()]),
    );
  }, [commentsOpen, profileMap, showPreview]);

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

  return (
    <Card style={styles.card}>
      {onOpenDetail ? (
        <Pressable onPress={onOpenDetail} style={styles.pressableContent}>
          <View style={styles.contentSection}>{children}</View>
        </Pressable>
      ) : (
        <View style={styles.contentSection}>{children}</View>
      )}

      <CardActions
        liked={liked}
        likes={likesCount}
        comments={commentsCount}
        onToggleLike={actions.onToggleLike || (() => {})}
        onPressComment={handlePressComment}
        onPressShare={actions.onPressShare}
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
                  <Text style={styles.previewText}>
                    {' '}
                    {renderTextWithEntities(comment.text, { mentionLabels })}
                  </Text>
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
          profileMap={profileMap}
          maxInlineComments={maxInlineComments}
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
    marginHorizontal: theme.spacing[0],
    padding: theme.spacing[0],
  },
  imageContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  actionBar: {
    paddingHorizontal: theme.spacing[0],
    paddingVertical: theme.spacing[0],
  },
  pressableContent: {
    // Allows tapping card content to navigate
  },
  contentSection: {
    paddingHorizontal: theme.layout.cardPadding,
    paddingTop: theme.spacing[3],
  },
  previewContainer: {
    paddingHorizontal: theme.layout.cardPadding,
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
