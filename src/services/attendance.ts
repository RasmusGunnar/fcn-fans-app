import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../utils/avatar';
import { isDemoMode } from '../config/appMode';
import { getDemoParticipation, setDemoRsvp } from '../demo/interactions';
import { DEMO_USERS } from '../demo/users';
import { getDirectMessageBlockStatus } from './messagesApi';

export interface AttendanceSnapshot {
  countGoing: number;
  avatars: string[];
  profiles: AttendeeProfile[];
  userIds: string[];
  isGoing: boolean;
  rsvpStatus: RsvpStatus;
}

export type RsvpStatus = 'going' | 'interested' | 'not_going' | null;

export interface AttendeeProfile {
  canMessage?: boolean;
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
  if (isDemoMode) {
    const participants = DEMO_USERS.slice(0, 9);
    const participation = getDemoParticipation();
    return {
      countGoing: 24,
      profiles: participants.map((user) => ({
        user_id: user.id,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
      })),
      userIds: participants.map((user) => user.id),
      avatars: [],
      isGoing: participation.isGoing,
      rsvpStatus: participation.isGoing ? 'going' : null,
    };
  }
  const goingQuery = supabase
    .from('rsvps')
    .select('user_id', { count: 'exact' })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'going')
    .order('created_at', { ascending: false });
  if (entityType === 'match') goingQuery.order('user_id', { ascending: true }).limit(5);
  const ownStatusQuery = currentUserId
    ? supabase
        .from('rsvps')
        .select('status')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('user_id', currentUserId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [goingResult, ownStatusResult] = await Promise.all([goingQuery, ownStatusQuery]);
  const { data: rsvps, error: rsvpsError } = goingResult;

  if (rsvpsError) throw rsvpsError;
  if (ownStatusResult.error) throw ownStatusResult.error;

  const userIds = (rsvps || []).map((rsvp: { user_id: string }) => rsvp.user_id);
  const attendeeProfiles = await fetchAttendeeProfiles(userIds);

  return {
    countGoing: goingResult.count ?? userIds.length,
    profiles: attendeeProfiles,
    userIds,
    avatars: attendeeProfiles
      .map((profile) => resolveAvatarUrl(profile.avatar_url))
      .filter((url): url is string => !!url),
    isGoing: ownStatusResult.data?.status === 'going',
    rsvpStatus: (ownStatusResult.data?.status as RsvpStatus | undefined) ?? null,
  };
}

export async function setAttendanceStatus({
  entityType,
  entityId,
  userId,
  status,
}: {
  entityType: 'event' | 'match';
  entityId: string;
  userId: string;
  status: RsvpStatus;
}): Promise<void> {
  if (isDemoMode) {
    setDemoRsvp(status);
    return;
  }
  if (status === null) {
    const { error } = await supabase
      .from('rsvps')
      .delete()
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('user_id', userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('rsvps').upsert(
    {
      entity_type: entityType,
      entity_id: entityId,
      user_id: userId,
      status,
    },
    { onConflict: 'entity_type,entity_id,user_id' },
  );
  if (error) throw error;
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
/** Match RSVP identities, not Stadium Live/check-in visibility. Never called anonymously. */
export async function fetchMatchAttendeePage(matchId: string, offset = 0) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid offset');
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Authentication required');
  const { data, error } = await supabase
    .from('rsvps')
    .select('user_id')
    .eq('entity_type', 'match')
    .eq('entity_id', matchId)
    .eq('status', 'going')
    .order('created_at', { ascending: false })
    .order('user_id', { ascending: true })
    .range(offset, offset + 20);
  if (error) throw error;
  const rows = data ?? [];
  const ids = rows.slice(0, 20).map((row) => String(row.user_id));
  const profiles = await fetchAttendeeProfiles(ids);
  const socialProfiles = await Promise.all(profiles.map(async profile => ({
    ...profile,
    canMessage: profile.user_id !== auth.user.id && !(await getDirectMessageBlockStatus(profile.user_id)),
  })));
  return {
    profiles: ids.flatMap((id) => socialProfiles.filter((profile) => profile.user_id === id)),
    nextOffset: rows.length > 20 ? offset + 20 : null,
  };
}
