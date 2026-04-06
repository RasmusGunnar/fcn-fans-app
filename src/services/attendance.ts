import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../utils/avatar';

export interface AttendanceSnapshot {
  countGoing: number;
  avatars: string[];
  profiles: AttendeeProfile[];
  userIds: string[];
  isGoing: boolean;
}

export interface AttendeeProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

async function fetchAttendeeProfiles(userIds: string[]): Promise<AttendeeProfile[]> {
  if (userIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds);

  if (profilesError) throw profilesError;

  return (profiles || []).map((profile) => ({
    user_id: profile.id,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
  }));
}

export async function fetchAttendanceSnapshot({
  entityType,
  entityId,
  currentUserId,
}: {
  entityType: 'event' | 'match';
  entityId: string;
  currentUserId?: string;
}): Promise<AttendanceSnapshot> {
  const { data: rsvps, error: rsvpsError } = await supabase
    .from('rsvps')
    .select('user_id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'going')
    .order('created_at', { ascending: false });

  if (rsvpsError) throw rsvpsError;

  const userIds = (rsvps || []).map((rsvp: { user_id: string }) => rsvp.user_id);
  const attendeeProfiles = await fetchAttendeeProfiles(userIds);

  return {
    countGoing: userIds.length,
    profiles: attendeeProfiles,
    userIds,
    avatars: attendeeProfiles
      .map((profile) => resolveAvatarUrl(profile.avatar_url))
      .filter((url): url is string => !!url),
    isGoing: !!(currentUserId && userIds.includes(currentUserId)),
  };
}

export async function fetchAttendees({
  entityType,
  entityId,
}: {
  entityType: 'event' | 'match';
  entityId: string;
}): Promise<AttendeeProfile[]> {
  try {
    const { data: rsvps, error: rsvpsError } = await supabase
      .from('rsvps')
      .select('user_id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('status', 'going')
      .order('created_at', { ascending: false });

    if (rsvpsError) throw rsvpsError;

    const userIds = (rsvps || []).map((rsvp: { user_id: string }) => rsvp.user_id);
    return fetchAttendeeProfiles(userIds);
  } catch (error) {
    logger.error('[attendance] Error loading attendees:', error);
    throw error;
  }
}

export async function fetchEventAttendees(eventId: string): Promise<AttendeeProfile[]> {
  return fetchAttendees({ entityType: 'event', entityId: eventId });
}
