import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { WILD_TIGERS_COMMUNITY_NAME } from './rbac';

export type FanActivityParentType = 'match' | 'event';

export type FanActivityCommunity = {
  id: string;
  name: string;
};

export type CreateFanActivityInput = {
  parentType: FanActivityParentType;
  parentId: string;
  communityId?: string | null;
  parentCommunityId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  startsAt: string;
  endsAt?: string | null;
  locationName?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

export type ResolvedFanActivityCommunity = {
  community: FanActivityCommunity | null;
  source: 'event_parent' | 'wild_tigers_default' | 'single_owned_fallback' | 'unresolved';
  errorMessage: string | null;
};

export type FanActivity = {
  id: string;
  parent_type: FanActivityParentType;
  parent_id: string;
  community_id: string;
  created_by: string | null;
  type: string;
  title: string;
  body: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  location_address: string | null;
  lat: number | null;
  lng: number | null;
  cover_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  is_published: boolean;
  is_cancelled: boolean;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  community: FanActivityCommunity | null;
};

type FanActivityCommunityRow = {
  id: string;
  name: string;
};

type OwnedCommunityMembershipRow = {
  community_id: string;
};

type FanActivityRow = Omit<FanActivity, 'community'> & {
  communities?: FanActivityCommunityRow | FanActivityCommunityRow[] | null;
};

const FAN_ACTIVITY_SELECT =
  'id, parent_type, parent_id, community_id, created_by, type, title, body, starts_at, ends_at, location_name, location_address, lat, lng, cover_url, cta_label, cta_url, is_published, is_cancelled, sort_order, created_at, updated_at, communities(id, name)';

function normalizeCommunityName(name: string | null | undefined): string {
  return name?.trim().toLowerCase() ?? '';
}

function isMissingFanActivitiesTable(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : null;
  const message =
    typeof error === 'object' && error !== null ? String((error as { message?: string }).message ?? '') : '';

  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
}

function toCommunity(row: FanActivityRow): FanActivityCommunity | null {
  const communityRow = Array.isArray(row.communities) ? row.communities[0] : row.communities;
  if (!communityRow?.id || !communityRow.name) {
    return null;
  }

  return {
    id: communityRow.id,
    name: communityRow.name,
  };
}

function toFanActivity(row: FanActivityRow): FanActivity {
  return {
    id: row.id,
    parent_type: row.parent_type,
    parent_id: row.parent_id,
    community_id: row.community_id,
    created_by: row.created_by ?? null,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    starts_at: row.starts_at,
    ends_at: row.ends_at ?? null,
    location_name: row.location_name ?? null,
    location_address: row.location_address ?? null,
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null,
    cover_url: row.cover_url ?? null,
    cta_label: row.cta_label ?? null,
    cta_url: row.cta_url ?? null,
    is_published: row.is_published === true,
    is_cancelled: row.is_cancelled === true,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    community: toCommunity(row),
  };
}

function isValidFanActivityRow(row: unknown): row is FanActivityRow {
  if (!row || typeof row !== 'object') {
    return false;
  }

  const candidate = row as Partial<FanActivityRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.parent_id === 'string' &&
    (candidate.parent_type === 'match' || candidate.parent_type === 'event') &&
    typeof candidate.title === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.starts_at === 'string'
  );
}

function normalizeExternalUrl(url: string | null | undefined): string | null {
  const normalized = url?.trim() || null;
  if (!normalized) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

function toCommunityList(rows: FanActivityCommunityRow[] | null | undefined): FanActivityCommunity[] {
  return (rows || [])
    .filter((row): row is FanActivityCommunityRow => Boolean(row?.id && row?.name))
    .map((row) => ({
      id: row.id,
      name: row.name,
    }));
}

async function fetchFanActivitiesForParent(
  parentType: FanActivityParentType,
  parentId: string,
): Promise<FanActivity[]> {
  const normalizedParentId = parentId.trim();
  if (!normalizedParentId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('fan_activities')
      .select(FAN_ACTIVITY_SELECT)
      .eq('parent_type', parentType)
      .eq('parent_id', normalizedParentId)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .order('starts_at', { ascending: true })
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) {
      if (isMissingFanActivitiesTable(error)) {
        logger.warn('[fanActivities] fan_activities table not available yet. Returning empty array.');
        return [];
      }

      logger.warn('[fanActivities] Query failed:', {
        parentType,
        parentId: normalizedParentId,
        error,
      });
      return [];
    }

    return ((data || []) as FanActivityRow[]).map(toFanActivity);
  } catch (error) {
    logger.warn('[fanActivities] Unexpected fetch error:', {
      parentType,
      parentId: normalizedParentId,
      error,
    });
    return [];
  }
}

export async function fetchFanActivitiesForMatch(matchId: string): Promise<FanActivity[]> {
  return fetchFanActivitiesForParent('match', matchId);
}

export async function fetchFanActivitiesForEvent(eventId: string): Promise<FanActivity[]> {
  return fetchFanActivitiesForParent('event', eventId);
}

export async function fetchHomeFanActivities(limit = 12): Promise<FanActivity[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));

  try {
    const { data, error } = await supabase
      .from('fan_activities')
      .select(FAN_ACTIVITY_SELECT)
      .eq('is_published', true)
      .eq('is_cancelled', false)
      .order('starts_at', { ascending: true })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .limit(safeLimit);

    if (error) {
      if (isMissingFanActivitiesTable(error)) {
        logger.warn('[fanActivities] fan_activities table not available yet. Returning empty Home list.');
        return [];
      }

      logger.warn('[fanActivities] Home query failed:', { error, limit: safeLimit });
      return [];
    }

    const safeRows = ((data || []) as unknown[]).filter(isValidFanActivityRow);

    if (__DEV__ && safeRows.length !== (data || []).length) {
      logger.warn('[fanActivities] Dropped invalid Home fan_activity rows before mapping.', {
        fetched: (data || []).length,
        kept: safeRows.length,
      });
    }

    return safeRows.map(toFanActivity);
  } catch (error) {
    logger.warn('[fanActivities] Unexpected Home fetch error:', { error, limit: safeLimit });
    return [];
  }
}

export async function fetchOwnedFanActivityCommunities(
  userId: string,
): Promise<FanActivityCommunity[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return [];
  }

  try {
    const { data: memberships, error: membershipsError } = await supabase
      .from('community_members')
      .select('community_id')
      .eq('user_id', normalizedUserId)
      .eq('role', 'owner');

    if (membershipsError) {
      logger.warn('[fanActivities] Failed to load owned communities:', {
        userId: normalizedUserId,
        error: membershipsError,
      });
      return [];
    }

    const communityIds = Array.from(
      new Set(
        ((memberships || []) as OwnedCommunityMembershipRow[])
          .map((membership) => membership.community_id)
          .filter(Boolean),
      ),
    );

    if (communityIds.length === 0) {
      return [];
    }

    const { data: communities, error: communitiesError } = await supabase
      .from('communities')
      .select('id, name')
      .in('id', communityIds)
      .order('name', { ascending: true });

    if (communitiesError) {
      logger.warn('[fanActivities] Failed to resolve owned community names:', {
        userId: normalizedUserId,
        error: communitiesError,
      });
      return [];
    }

    return toCommunityList((communities || []) as FanActivityCommunityRow[]);
  } catch (error) {
    logger.warn('[fanActivities] Unexpected owned communities error:', {
      userId: normalizedUserId,
      error,
    });
    return [];
  }
}

export async function resolveCreateFanActivityCommunity(params: {
  userId: string;
  parentType: FanActivityParentType;
  parentCommunityId?: string | null;
}): Promise<ResolvedFanActivityCommunity> {
  const normalizedUserId = params.userId.trim();
  const normalizedParentCommunityId = params.parentCommunityId?.trim() || null;

  if (!normalizedUserId) {
    return {
      community: null,
      source: 'unresolved',
      errorMessage: 'Du skal være logget ind for at oprette fanaktiviteter.',
    };
  }

  const ownedCommunities = await fetchOwnedFanActivityCommunities(normalizedUserId);

  if (params.parentType === 'event') {
    if (!normalizedParentCommunityId) {
      return {
        community: null,
        source: 'unresolved',
        errorMessage: 'Eventet mangler et community, så afsender kan ikke fastlægges automatisk.',
      };
    }

    const parentCommunity =
      ownedCommunities.find((community) => community.id === normalizedParentCommunityId) ?? null;

    if (!parentCommunity) {
      return {
        community: null,
        source: 'unresolved',
        errorMessage: 'Du kan ikke oprette fanaktiviteter for dette event-community.',
      };
    }

    return {
      community: parentCommunity,
      source: 'event_parent',
      errorMessage: null,
    };
  }

  const normalizedWildTigersName = normalizeCommunityName(WILD_TIGERS_COMMUNITY_NAME);
  const wildTigersMatches = ownedCommunities.filter(
    (community) => normalizeCommunityName(community.name) === normalizedWildTigersName,
  );

  if (wildTigersMatches.length === 1) {
    return {
      community: wildTigersMatches[0],
      source: 'wild_tigers_default',
      errorMessage: null,
    };
  }

  if (ownedCommunities.length === 1) {
    return {
      community: ownedCommunities[0],
      source: 'single_owned_fallback',
      errorMessage: null,
    };
  }

  // TODO: Replace this conservative fallback once the app has a stable,
  // migration-backed Wild Tigers identifier for match-linked fan activities.
  return {
    community: null,
    source: 'unresolved',
    errorMessage:
      'Kunne ikke fastlægge afsender automatisk for kampen endnu. V1 kræver en entydig Wild Tigers-owner eller præcis ét owner-community.',
  };
}

export async function createFanActivity(input: CreateFanActivityInput): Promise<FanActivity> {
  const normalizedParentId = input.parentId.trim();
  const normalizedType = input.type.trim();
  const normalizedTitle = input.title.trim();
  const normalizedBody = input.body?.trim() || null;
  const normalizedLocationName = input.locationName?.trim() || null;
  const normalizedEndsAt = input.endsAt?.trim() || null;
  const normalizedCtaLabel = input.ctaLabel?.trim() || null;
  const normalizedCtaUrl = normalizeExternalUrl(input.ctaUrl);

  if (!normalizedParentId) {
    throw new Error('Parent-ID mangler.');
  }

  if (!normalizedType) {
    throw new Error('Type er påkrævet.');
  }

  if (!normalizedTitle) {
    throw new Error('Titel er påkrævet.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user?.id) {
    throw new Error('Du skal være logget ind.');
  }

  let normalizedCommunityId = input.communityId?.trim() || '';

  if (!normalizedCommunityId) {
    const resolution = await resolveCreateFanActivityCommunity({
      userId: user.id,
      parentType: input.parentType,
      parentCommunityId: input.parentCommunityId ?? null,
    });

    if (!resolution.community?.id) {
      throw new Error(resolution.errorMessage || 'Community kunne ikke fastlægges automatisk.');
    }

    normalizedCommunityId = resolution.community.id;
  }

  const insertPayload = {
    parent_type: input.parentType,
    parent_id: normalizedParentId,
    community_id: normalizedCommunityId,
    created_by: user.id,
    type: normalizedType,
    title: normalizedTitle,
    body: normalizedBody,
    starts_at: input.startsAt,
    ends_at: normalizedEndsAt,
    location_name: normalizedLocationName,
    cta_label: normalizedCtaLabel,
    cta_url: normalizedCtaUrl,
    is_published: true,
    is_cancelled: false,
  };

  const { data, error } = await supabase
    .from('fan_activities')
    .insert(insertPayload)
    .select(
      'id, parent_type, parent_id, community_id, created_by, type, title, body, starts_at, ends_at, location_name, location_address, lat, lng, cover_url, cta_label, cta_url, is_published, is_cancelled, sort_order, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return toFanActivity({
    ...(data as Omit<FanActivityRow, 'communities'>),
    communities: null,
  });
}
