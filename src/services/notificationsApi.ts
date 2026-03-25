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
};

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
  return supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
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
