/**
 * Permission helpers for determining if a user can edit/delete content.
 * Used to show UI controls and as a client-side check.
 * Server-side RLS policies are the authoritative source of truth.
 *
 * PERMISSION HIERARCHY:
 * 1. System admin (app_admins) - can edit/delete EVERYTHING
 * 2. Community owner/admin (community_members.role IN ('owner','admin')) - can edit/delete content WITHIN THEIR COMMUNITY
 * 3. Content author - can edit/delete their own content
 *
 * SCOPING:
 * - Events: organizer_group_id matches community_id -> owner/admin can moderate
 * - Posts/Comments: NO community scope yet -> only author + system admin
 *   TODO: Add post_groups or organizer_group_id on posts to enable community moderation
 */

import { CommunityRole } from '../hooks/useCommunityRole';

export interface PostPermissionObject {
  author_id?: string;
  // TODO: Add community_id or organizer_group_id when posts get community scoping
}

export interface CommentPermissionObject {
  author_id?: string;
  post_id?: string;
  // TODO: Add community_id when comments get community scoping
}

export interface EventPermissionObject {
  created_by?: string | null;
  organizer_group_id?: string | null;
}

export type FeedItemActorType = 'user' | 'community';

/**
 * Check if user can edit songs.
 * Rules: System admin OR owner/admin of Wild Tigers
 */
export function canEditSongs(
  isAppAdmin: boolean,
  communityRole?: CommunityRole | null,
): boolean {
  if (isAppAdmin) return true;
  return communityRole === 'owner' || communityRole === 'admin';
}

/**
 * Check if user can edit a post.
 * Rules: System admin OR post author
 * TODO: Add community admin check when posts have community_id
 */
export function canEditPost(
  userId: string | undefined,
  isAppAdmin: boolean,
  post: PostPermissionObject,
  communityRole?: CommunityRole,
): boolean {
  if (isAppAdmin) return true;
  if (!userId) return false;
  if (post.author_id === userId) return true;
  if (communityRole && ['owner', 'admin'].includes(communityRole)) return true;
  return false;
}

/**
 * Check if user can delete a post.
 * Rules: System admin OR post author
 * TODO: Add community admin check when posts have community_id
 */
export function canDeletePost(
  userId: string | undefined,
  isAppAdmin: boolean,
  post: PostPermissionObject,
  communityRole?: CommunityRole,
): boolean {
  if (isAppAdmin) return true;
  if (!userId) return false;
  return post.author_id === userId;
  // TODO: Add community admin check: || (communityRole in ('owner','admin') && post.community_id matches)
}

/**
 * Check if user can edit a comment.
 * Rules: System admin OR comment author
 * TODO: Add community admin check when comments have community_id
 */
export function canEditComment(
  userId: string | undefined,
  isAppAdmin: boolean,
  comment: CommentPermissionObject,
  communityRole?: CommunityRole,
): boolean {
  if (isAppAdmin) return true;
  if (!userId) return false;
  return comment.author_id === userId;
  // TODO: Add community admin check
}

/**
 * Check if user can delete a comment.
 * Rules: System admin OR comment author OR post author
 * TODO: Add community admin check when comments have community_id
 */
export function canDeleteComment(
  userId: string | undefined,
  isAppAdmin: boolean,
  comment: CommentPermissionObject,
  postAuthorId?: string,
  communityRole?: CommunityRole,
): boolean {
  if (isAppAdmin) return true;
  if (!userId) return false;
  if (comment.author_id === userId) return true;
  if (postAuthorId && postAuthorId === userId) return true;
  // TODO: Add community admin check
  return false;
}

/**
 * Check if user can edit an event.
 * Rules: System admin OR event creator OR community owner/admin (if organizer_group_id set)
 */
export function canEditEvent(
  userId: string | undefined,
  isAppAdmin: boolean,
  event: EventPermissionObject,
  communityRole?: CommunityRole,
): boolean {
  if (isAppAdmin) return true;
  if (!userId) return false;
  if (event.created_by === userId) return true;
  // Community owner/admin can edit events in their community
  if (event.organizer_group_id && communityRole && ['owner', 'admin'].includes(communityRole)) {
    return true;
  }
  return false;
}

/**
 * Check if user can delete an event.
 * Rules: System admin OR event creator OR community owner/admin (if organizer_group_id set)
 */
export function canDeleteEvent(
  userId: string | undefined,
  isAppAdmin: boolean,
  event: EventPermissionObject,
  communityRole?: CommunityRole,
): boolean {
  if (isAppAdmin) return true;
  if (!userId) return false;
  if (event.created_by === userId) return true;
  // Community owner/admin can delete events in their community
  if (event.organizer_group_id && communityRole && ['owner', 'admin'].includes(communityRole)) {
    return true;
  }
  return false;
}

export function canDeleteFeedItem({
  isAppAdmin,
  viewerUserId,
  itemAuthorId,
  itemActorType,
  itemCommunityRole,
}: {
  isAppAdmin: boolean;
  viewerUserId?: string;
  itemAuthorId?: string | null;
  itemActorType?: FeedItemActorType;
  itemCommunityRole?: CommunityRole | null;
}): boolean {
  if (isAppAdmin) return true;
  if (viewerUserId && itemAuthorId && viewerUserId === itemAuthorId) return true;
  if (itemActorType === 'community' && itemCommunityRole && ['owner', 'admin'].includes(itemCommunityRole)) {
    return true;
  }
  return false;
}
