// ✅ DESIGN SYSTEM GUARDRAIL: This file uses theme tokens via defaultTheme.
// All spacing, colors, and radius values must use theme.spacing[N], theme.colors.*, theme.radius.*
// NO hardcoded numbers or color strings allowed.
// Do not import FeedCardShell directly. Use CardRoot from src/components/cards/CardRoot.tsx

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui';
import { CardActions } from '../cards/CardActions';
import { CardShell } from '../cards/CardShell';
import { CardMedia, type CardMediaProps } from '../cards/CardMedia';
import { InlineComments, CommentTargetType } from '../comments/InlineComments';
import { defaultTheme } from '../../theme';
import type { CommentPreview } from '../../services/likesApi';
import { targetKey } from '../../utils/targetKey';
import { resolveProfileDisplayName, type ProfileMap } from '../../utils/actor';
import { CategoryBadge } from '../ui';
import type { CategoryKey } from '../../theme/categories';
import { Avatar } from '../Avatar';

interface FeedCardShellProps {
  targetType: CommentTargetType;
  targetId: string;
  currentUserId: string | undefined;
  isAppAdmin: boolean;
  profileMap?: ProfileMap;
  categoryKey?: CategoryKey;
  badgeSlot?: React.ReactNode;
  hasHeader?: boolean;
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

const isCardMediaElement = (
  child: React.ReactNode,
): child is React.ReactElement<CardMediaProps> => {
  return React.isValidElement(child) && child.type === CardMedia;
};

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
  profileMap,
  categoryKey,
  badgeSlot,
  hasHeader = true,
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
    return resolveProfileDisplayName(
      profileMap,
      comment.author_id,
      comment.author_display_name ?? undefined,
    );
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

  const childArray = React.Children.toArray(children);
  const headerChild = hasHeader ? childArray[0] : undefined;
  const bodyChildren = hasHeader ? childArray.slice(1) : childArray;

  const sections = bodyChildren.reduce<
    Array<{ type: 'content' | 'media'; children: React.ReactNode[]; aspectRatio?: number }>
  >((acc, child) => {
    if (isCardMediaElement(child)) {
      acc.push({ type: 'media', children: [child.props.children], aspectRatio: child.props.aspectRatio });
      return acc;
    }

    const last = acc[acc.length - 1];
    if (last && last.type === 'content') {
      last.children.push(child);
    } else {
      acc.push({ type: 'content', children: [child] });
    }
    return acc;
  }, []);

  return (
    <CardShell style={styles.card}>
      {badgeSlot || categoryKey ? (
        <View style={styles.badgeSection}>
          {badgeSlot ? badgeSlot : <CategoryBadge categoryKey={categoryKey as CategoryKey} />}
        </View>
      ) : null}

      {headerChild ? <View style={styles.userSection}>{headerChild}</View> : null}

      {sections.map((section, index) =>
        section.type === 'media' ? (
          <View key={`media-${index}`} style={styles.imageOuter}>
            <View style={[styles.imageContainer, { aspectRatio: section.aspectRatio || 4 / 3 }]}>
              {section.children}
            </View>
          </View>
        ) : (
          <View key={`content-${index}`} style={styles.contentSection}>
            {section.children}
          </View>
        ),
      )}

      <View style={styles.actionBar}>
        <CardActions
          liked={liked}
          likes={likesCount}
          comments={commentsCount}
          onToggleLike={actions.onToggleLike || (() => {})}
          onPressComment={handlePressComment}
          onPressShare={actions.onPressShare || (() => {})}
        />
      </View>

      {showPreview && (
        <View style={styles.previewContainer}>
          <Pressable onPress={handlePressComment}>
            <Text variant="caption" color="secondary" style={styles.viewAllText}>
              Se alle {commentsCount} kommentarer
            </Text>
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
                  <Text variant="caption" color="primary" style={styles.previewAuthor}>
                    {displayName}
                  </Text>
                  <Text variant="caption" color="primary" style={styles.previewText}>
                    {' '}
                    {comment.text}
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
          onNewComment={handleNewComment}
        />
      )}
    </CardShell>
  );
}

const theme = defaultTheme;

const sectionPaddingHorizontal = theme.spacing[4];

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.layout.listGap,
    padding: theme.spacing[0],
    marginHorizontal: theme.spacing[3],
  },
  badgeSection: {
    paddingHorizontal: sectionPaddingHorizontal,
    paddingVertical: theme.spacing[3],
  },
  userSection: {
    paddingHorizontal: sectionPaddingHorizontal,
    paddingVertical: theme.spacing[3],
  },
  contentSection: {
    paddingHorizontal: sectionPaddingHorizontal,
    paddingBottom: theme.spacing[3],
  },
  imageOuter: {
    width: '100%',
    marginHorizontal: theme.spacing[0],
    paddingHorizontal: theme.spacing[0],
  },
  imageContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  actionBar: {
    paddingHorizontal: sectionPaddingHorizontal,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[4],
  },
  pressableContent: {
    // Allows tapping card content to navigate
  },
  previewContainer: {
    paddingHorizontal: sectionPaddingHorizontal,
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  viewAllText: {
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
    marginRight: theme.spacing[1],
  },
  previewText: {
  },
});
