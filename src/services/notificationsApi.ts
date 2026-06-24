import { supabase } from '../lib/supabase';

export type NotificationItem = {
  id: string;
  user_id: string;
  actor_id: string;
  type: 'mention' | 'reply';
  entity_type: 'post' | 'comment';
  entity_id: string;
  post_id: string;
  read: boolean;
  created_at: string;
  actor_display_name?: string | null;
  reply_comment_parent_id?: string | null;
};

type ProfileRow = {
  id: string;
  display_name?: string | null;
  username?: string | null;
};

type CommentParentRow = {
  id: string;
  parent_id?: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function uniqueStrings(values: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim() ?? '').filter((value) => value.length > 0)),
  );
}

function getProfileName(profile: ProfileRow): string | null {
  return readString(profile.display_name) ?? readString(profile.username);
}

export async function createNotification(payload: {
  user_id: string;
  actor_id: string;
  type: 'mention' | 'reply';
  entity_type: 'post' | 'comment';
  entity_id: string;
  post_id: string;
}) {
  return supabase.from('notifications').insert(payload);
}

export async function getNotifications(userId: string) {
  const response = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (response.data as NotificationItem[] | null) ?? null;
  if (response.error || !rows || rows.length === 0) {
    return response;
  }

  const actorIds = uniqueStrings(rows.map((row) => row.actor_id));
  const replyCommentIds = uniqueStrings(
    rows
      .filter((row) => row.type === 'reply' && row.entity_type === 'comment')
      .map((row) => row.entity_id),
  );

  const [profilesResponse, commentsResponse] = await Promise.all([
    actorIds.length > 0
      ? supabase.from('profiles').select('id, display_name, username').in('id', actorIds)
      : Promise.resolve({ data: null, error: null }),
    replyCommentIds.length > 0
      ? supabase.from('comments_v2').select('id, parent_id').in('id', replyCommentIds)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const actorNameById = new Map(
    ((profilesResponse.data as ProfileRow[] | null) ?? [])
      .map((profile) => [profile.id, getProfileName(profile)] as const)
      .filter(([, name]) => Boolean(name)) as [string, string][],
  );
  const commentParentById = new Map(
    ((commentsResponse.data as CommentParentRow[] | null) ?? []).map((comment) => [
      comment.id,
      comment.parent_id ?? null,
    ]),
  );

  return {
    ...response,
    data: rows.map((row) => {
      const hasReplyCommentParent = commentParentById.has(row.entity_id);
      return {
        ...row,
        actor_display_name: actorNameById.get(row.actor_id) ?? null,
        ...(hasReplyCommentParent
          ? { reply_comment_parent_id: commentParentById.get(row.entity_id) ?? null }
          : {}),
      };
    }),
  };
}

export async function markAsRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  return !error;
}

export async function getUnreadNotificationsCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    return 0;
  }

  return count ?? 0;
}
