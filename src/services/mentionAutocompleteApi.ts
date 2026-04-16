import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../utils/avatar';
import { normalizeDisplayNameToUsername } from '../utils/username';

export type ProfileMentionSuggestion = {
  type: 'profile';
  id: string;
  handle: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type CommunityMentionSuggestion = {
  type: 'community';
  id: string;
  handle: string;
  mention_key: string;
  name: string;
  avatar_url: string | null;
};

export type MentionSuggestion = ProfileMentionSuggestion | CommunityMentionSuggestion;

export type MentionTarget =
  | {
      type: 'profile';
      id: string;
      handle: string;
      label: string;
    }
  | {
      type: 'community';
      id: string;
      handle: string;
      label: string;
      title: string;
    };

type SearchMentionSuggestionsOptions = {
  includeCommunities?: boolean;
};

const SUGGESTION_LIMIT = 6;

function normalizeMentionQuery(query: string): string {
  return normalizeDisplayNameToUsername(query.trim()) ?? '';
}

function normalizeMentionHandle(handle: string): string {
  return normalizeMentionQuery(handle.replace(/^@+/, ''));
}

async function searchProfileMentionSuggestions(query: string): Promise<ProfileMentionSuggestion[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .not('username', 'is', null)
    .ilike('username', `${query}%`)
    .order('username', { ascending: true })
    .limit(SUGGESTION_LIMIT);

  if (error) {
    throw error;
  }

  return ((data || []) as {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  }[])
    .filter(
      (
        profile,
      ): profile is { id: string; username: string; display_name?: string | null; avatar_url?: string | null } =>
        typeof profile.username === 'string' && profile.username.trim().length > 0,
    )
    .map((profile) => ({
      type: 'profile',
      id: profile.id,
      handle: profile.username,
      username: profile.username,
      display_name: profile.display_name ?? null,
      avatar_url: profile.avatar_url ?? null,
    }));
}

async function searchCommunityMentionSuggestions(
  query: string,
): Promise<CommunityMentionSuggestion[]> {
  const { data, error } = await supabase
    .from('communities')
    .select('id, name, mention_key, avatar_url, avatar_path')
    .not('mention_key', 'is', null)
    .ilike('mention_key', `${query}%`)
    .order('name', { ascending: true })
    .limit(SUGGESTION_LIMIT);

  if (error) {
    throw error;
  }

  return ((data || []) as {
    id: string;
    name?: string | null;
    mention_key?: string | null;
    avatar_url?: string | null;
    avatar_path?: string | null;
  }[])
    .filter(
      (
        community,
      ): community is {
        id: string;
        name: string;
        mention_key: string;
        avatar_url?: string | null;
        avatar_path?: string | null;
      } =>
        typeof community.name === 'string' &&
        community.name.trim().length > 0 &&
        typeof community.mention_key === 'string' &&
        community.mention_key.trim().length > 0,
    )
    .map((community) => ({
      type: 'community',
      id: community.id,
      handle: community.mention_key,
      mention_key: community.mention_key,
      name: community.name,
      avatar_url: resolveAvatarUrl(community.avatar_url ?? community.avatar_path ?? null),
    }));
}

export async function searchMentionSuggestions(
  query: string,
  options: SearchMentionSuggestionsOptions = {},
): Promise<MentionSuggestion[]> {
  const normalizedQuery = normalizeMentionQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  try {
    const profileSuggestions = await searchProfileMentionSuggestions(normalizedQuery);

    if (!options.includeCommunities) {
      return profileSuggestions;
    }

    const communitySuggestions = await searchCommunityMentionSuggestions(normalizedQuery);
    return [...profileSuggestions, ...communitySuggestions].slice(0, SUGGESTION_LIMIT);
  } catch (error) {
    logger.warn('[mentionAutocompleteApi] searchMentionSuggestions failed:', error);
    return [];
  }
}

export async function resolveMentionTargetByHandle(handle: string): Promise<MentionTarget | null> {
  const normalizedHandle = normalizeMentionHandle(handle);

  if (!normalizedHandle) {
    return null;
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .eq('username', normalizedHandle)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (profile?.id) {
      return {
        type: 'profile',
        id: profile.id,
        handle: normalizedHandle,
        label: profile.display_name?.trim() || profile.username || normalizedHandle,
      };
    }

    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id, name, mention_key')
      .eq('mention_key', normalizedHandle)
      .maybeSingle();

    if (communityError) {
      throw communityError;
    }

    if (!community?.id || !community?.mention_key) {
      return null;
    }

    return {
      type: 'community',
      id: community.id,
      handle: community.mention_key,
      label: community.name?.trim() || community.mention_key,
      title: community.name?.trim() || community.mention_key,
    };
  } catch (error) {
    logger.warn('[mentionAutocompleteApi] resolveMentionTargetByHandle failed:', {
      handle: normalizedHandle,
      error,
    });
    return null;
  }
}
