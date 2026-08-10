import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import type {
  SentStadiumReaction,
  StadiumLivePreferences,
  StadiumParticipant,
  StadiumParticipantPage,
  StadiumReaction,
  StadiumReactionType,
} from '../types/stadiumLive';

type StadiumParticipantRow = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  fan_level_key: string | null;
  section_label: string | null;
  same_community: boolean;
  reacted_recently: boolean;
  can_react: boolean;
  can_message: boolean;
  rank_bucket: number;
  total_count: number | string;
};

type StadiumReactionRow = {
  reaction_id: string;
  event_id: string;
  actor_id: string;
  recipient_user_id: string;
  reaction_type: StadiumReactionType;
  reply_to_reaction_id: string | null;
  created_at: string;
  actor_display_name: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  received: boolean;
  replied: boolean;
};

const DEFAULT_PREFERENCES: StadiumLivePreferences = {
  isVisible: false,
  reactionsEnabled: true,
  sectionLabel: null,
  updatedAt: null,
};

function singleRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function mapPreferences(row: any): StadiumLivePreferences {
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    isVisible: row.is_visible === true,
    reactionsEnabled: row.reactions_enabled !== false,
    sectionLabel: row.section_label ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function mapParticipant(row: StadiumParticipantRow): StadiumParticipant {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    fanLevelKey: row.fan_level_key,
    sectionLabel: row.section_label,
    sameCommunity: row.same_community === true,
    reactedRecently: row.reacted_recently === true,
    canReact: row.can_react === true,
    canMessage: row.can_message === true,
    rankBucket: Number(row.rank_bucket),
  };
}

function mapReaction(row: StadiumReactionRow): StadiumReaction {
  return {
    id: row.reaction_id,
    eventId: row.event_id,
    actorId: row.actor_id,
    recipientUserId: row.recipient_user_id,
    reactionType: row.reaction_type,
    replyToReactionId: row.reply_to_reaction_id,
    createdAt: row.created_at,
    actorDisplayName: row.actor_display_name,
    actorUsername: row.actor_username,
    actorAvatarUrl: row.actor_avatar_url,
    received: row.received === true,
    replied: row.replied === true,
  };
}

function stadiumErrorMessage(error: any): string {
  const message = String(error?.message ?? '');
  if (message.includes('Check ind') || message.includes('checket ind')) {
    return 'Check ind til kampen for at bruge Stadion Live.';
  }
  if (message.includes('ikke åbent')) return 'Stadion Live er ikke åbent til denne kamp.';
  if (message.includes('Vent lidt')) return 'Vent lidt, før du reagerer til samme fan igen.';
  if (message.includes('mange reaktioner'))
    return 'Du har sendt mange reaktioner. Prøv igen om lidt.';
  if (message.includes('kan ikke modtage')) return 'Denne fan modtager ikke stadionreaktioner.';
  if (message.includes('kan ikke sendes')) return 'Reaktionen kan ikke sendes.';
  return message || 'Stadion Live kunne ikke opdateres.';
}

function throwStadiumError(error: any): never {
  throw new Error(stadiumErrorMessage(error));
}

export async function getStadiumLivePreferences(): Promise<StadiumLivePreferences> {
  const { data, error } = await supabase.rpc('get_stadium_live_preferences');
  if (error) throwStadiumError(error);
  return mapPreferences(singleRow(data as any));
}

export async function updateStadiumLivePreferences(input: {
  isVisible: boolean;
  reactionsEnabled: boolean;
  sectionLabel: string | null;
}): Promise<StadiumLivePreferences> {
  const { data, error } = await supabase.rpc('update_stadium_live_preferences', {
    p_is_visible: input.isVisible,
    p_reactions_enabled: input.reactionsEnabled,
    p_section_label: input.sectionLabel,
  });
  if (error) throwStadiumError(error);
  return mapPreferences(singleRow(data as any));
}

export async function getStadiumLiveCount(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_stadium_live_count', { p_event_id: eventId });
  if (error) throwStadiumError(error);
  return Number(data ?? 0);
}

export async function getStadiumLiveParticipants(input: {
  eventId: string;
  cursor?: { rank: number; userId: string } | null;
  limit?: number;
}): Promise<StadiumParticipantPage> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 50);
  const { data, error } = await supabase.rpc('get_stadium_live_participants', {
    p_event_id: input.eventId,
    p_after_rank: input.cursor?.rank ?? null,
    p_after_user_id: input.cursor?.userId ?? null,
    p_limit: limit,
  });
  if (error) throwStadiumError(error);

  const rows = ((data as StadiumParticipantRow[] | null) ?? []).map(mapParticipant);
  const last = rows.at(-1);
  const totalCount = Number((data as StadiumParticipantRow[] | null)?.[0]?.total_count ?? 0);
  return {
    participants: rows,
    totalCount,
    nextCursor:
      rows.length === limit && last ? { rank: last.rankBucket, userId: last.userId } : null,
  };
}

export async function sendStadiumReaction(input: {
  eventId: string;
  recipientUserId: string;
  reactionType: StadiumReactionType;
  replyToReactionId?: string | null;
}): Promise<SentStadiumReaction> {
  const { data, error } = await supabase.rpc('send_stadium_reaction', {
    p_event_id: input.eventId,
    p_recipient_user_id: input.recipientUserId,
    p_reaction_type: input.reactionType,
    p_reply_to_reaction_id: input.replyToReactionId ?? null,
  });
  if (error) throwStadiumError(error);
  const row = singleRow(data as any);
  if (!row?.reaction_id) throw new Error('Reaktionen blev ikke oprettet.');
  return {
    id: row.reaction_id,
    createdAt: row.created_at,
    cooldownUntil: row.cooldown_until,
  };
}

export async function getStadiumReactions(input: {
  eventId: string;
  cursor?: { createdAt: string; id: string } | null;
  limit?: number;
}): Promise<StadiumReaction[]> {
  const { data, error } = await supabase.rpc('get_stadium_reactions', {
    p_event_id: input.eventId,
    p_before_created_at: input.cursor?.createdAt ?? null,
    p_before_reaction_id: input.cursor?.id ?? null,
    p_limit: Math.min(Math.max(input.limit ?? 30, 1), 30),
  });
  if (error) throwStadiumError(error);
  return ((data as StadiumReactionRow[] | null) ?? []).map(mapReaction);
}

export async function getLatestIncomingStadiumReaction(
  userId: string,
  options?: { since?: string; reactionId?: string },
): Promise<StadiumReaction | null> {
  let query = supabase
    .from('social_reactions')
    .select(
      'id, context_id, actor_id, recipient_user_id, reaction_type, reply_to_reaction_id, created_at',
    )
    .eq('context_type', 'stadium')
    .eq('recipient_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (options?.reactionId) query = query.eq('id', options.reactionId);
  if (options?.since) query = query.gte('created_at', options.since);

  const { data, error } = await query.maybeSingle();
  if (error) {
    logger.warn('[stadiumLiveApi] latest incoming reaction failed', error);
    return null;
  }
  if (!data) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username, avatar_url')
    .eq('id', data.actor_id)
    .maybeSingle();

  return {
    id: data.id,
    eventId: data.context_id,
    actorId: data.actor_id,
    recipientUserId: data.recipient_user_id,
    reactionType: data.reaction_type as StadiumReactionType,
    replyToReactionId: data.reply_to_reaction_id,
    createdAt: data.created_at,
    actorDisplayName: profile?.display_name ?? null,
    actorUsername: profile?.username ?? null,
    actorAvatarUrl: profile?.avatar_url ?? null,
    received: true,
    replied: false,
  };
}
