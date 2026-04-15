import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import {
  fetchFanActivityRegistrationSummaries,
  getEmptyFanActivityRegistrationSummary,
  type FanActivityRegistrationSummary,
} from './fanActivityRegistrations';

export type FanActivityParentType = 'match' | 'event';

export type FanActivityCommunity = {
  id: string;
  name: string;
  type?: 'community' | 'fan_faction' | null;
  mobilepay_info?: string | null;
  mobilepay_instructions?: string | null;
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
  registrationEnabled?: boolean;
  registrationCapacity?: number | null;
  registrationPriceDkk?: number | null;
  registrationPaymentMode?: 'free' | 'manual' | null;
  registrationPaymentInstructions?: string | null;
  registrationMobilepayInfo?: string | null;
};

export type UpdateFanActivityInput = {
  fanActivityId: string;
  type: string;
  title: string;
  body?: string | null;
  startsAt: string;
  endsAt?: string | null;
  locationName?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  registrationEnabled?: boolean;
  registrationCapacity?: number | null;
  registrationPriceDkk?: number | null;
  registrationPaymentMode?: 'free' | 'manual' | null;
  registrationPaymentInstructions?: string | null;
  registrationMobilepayInfo?: string | null;
};

export type ResolvedFanActivityCommunity = {
  community: FanActivityCommunity | null;
  source: 'event_parent' | 'explicit_selection' | 'existing_activity' | 'unresolved';
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
  registration_enabled: boolean;
  registration_capacity: number | null;
  registration_price_dkk: number;
  registration_payment_mode: 'free' | 'manual';
  registration_payment_instructions: string | null;
  registration_mobilepay_info: string | null;
  registration_summary: FanActivityRegistrationSummary | null;
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
  type?: 'community' | 'fan_faction' | null;
  mobilepay_info?: string | null;
  mobilepay_instructions?: string | null;
};

type ManageableCommunityMembershipRow = {
  community_id: string;
};

type FanActivityRow = Omit<FanActivity, 'community' | 'registration_summary'> & {
  communities?: FanActivityCommunityRow | FanActivityCommunityRow[] | null;
};

const FAN_ACTIVITY_SELECT =
  'id, parent_type, parent_id, community_id, created_by, type, title, body, starts_at, ends_at, location_name, location_address, lat, lng, cover_url, cta_label, cta_url, registration_enabled, registration_capacity, registration_price_dkk, registration_payment_mode, registration_payment_instructions, registration_mobilepay_info, is_published, is_cancelled, sort_order, created_at, updated_at, communities(id, name, type, mobilepay_info, mobilepay_instructions)';

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
    type: communityRow.type ?? null,
    mobilepay_info: communityRow.mobilepay_info ?? null,
    mobilepay_instructions: communityRow.mobilepay_instructions ?? null,
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
    registration_enabled: row.registration_enabled === true,
    registration_capacity:
      typeof row.registration_capacity === 'number' ? row.registration_capacity : null,
    registration_price_dkk: Math.max(0, Number(row.registration_price_dkk ?? 0) || 0),
    registration_payment_mode: row.registration_payment_mode === 'manual' ? 'manual' : 'free',
    registration_payment_instructions: row.registration_payment_instructions ?? null,
    registration_mobilepay_info: row.registration_mobilepay_info ?? null,
    registration_summary: null,
    is_published: row.is_published === true,
    is_cancelled: row.is_cancelled === true,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    community: toCommunity(row),
  };
}

function withRegistrationSummary(
  activity: FanActivity,
  summaryMap: Record<string, FanActivityRegistrationSummary>,
): FanActivity {
  return {
    ...activity,
    registration_summary:
      summaryMap[activity.id] ??
      (activity.registration_enabled ? getEmptyFanActivityRegistrationSummary() : null),
  };
}

async function hydrateFanActivitiesWithRegistrationSummaries(
  activities: FanActivity[],
): Promise<FanActivity[]> {
  if (activities.length === 0) {
    return activities;
  }

  const summaryMap = await fetchFanActivityRegistrationSummaries(
    activities.map((activity) => activity.id),
  );

  return activities.map((activity) => withRegistrationSummary(activity, summaryMap));
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
      type: row.type ?? null,
      mobilepay_info: row.mobilepay_info ?? null,
      mobilepay_instructions: row.mobilepay_instructions ?? null,
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

    return hydrateFanActivitiesWithRegistrationSummaries(
      ((data || []) as FanActivityRow[]).map(toFanActivity),
    );
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

export async function fetchFanActivityById(fanActivityId: string): Promise<FanActivity | null> {
  const normalizedFanActivityId = fanActivityId.trim();
  if (!normalizedFanActivityId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('fan_activities')
      .select(FAN_ACTIVITY_SELECT)
      .eq('id', normalizedFanActivityId)
      .maybeSingle();

    if (error) {
      if (isMissingFanActivitiesTable(error)) {
        logger.warn('[fanActivities] fan_activities table not available yet. Returning null item.');
        return null;
      }

      logger.warn('[fanActivities] Single fetch failed:', {
        fanActivityId: normalizedFanActivityId,
        error,
      });
      return null;
    }

    if (!data || !isValidFanActivityRow(data)) {
      return null;
    }

    const [hydratedActivity] = await hydrateFanActivitiesWithRegistrationSummaries([
      toFanActivity(data as FanActivityRow),
    ]);

    return hydratedActivity ?? null;
  } catch (error) {
    logger.warn('[fanActivities] Unexpected single fetch error:', {
      fanActivityId: normalizedFanActivityId,
      error,
    });
    return null;
  }
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

    return hydrateFanActivitiesWithRegistrationSummaries(safeRows.map(toFanActivity));
  } catch (error) {
    logger.warn('[fanActivities] Unexpected Home fetch error:', { error, limit: safeLimit });
    return [];
  }
}

export async function fetchManageableFanActivityCommunities(
  userId: string,
  options?: {
    communityType?: 'community' | 'fan_faction';
  },
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
      .in('role', ['owner', 'admin']);

    if (membershipsError) {
      logger.warn('[fanActivities] Failed to load manageable communities:', {
        userId: normalizedUserId,
        error: membershipsError,
      });
      return [];
    }

    const communityIds = Array.from(
      new Set(
        ((memberships || []) as ManageableCommunityMembershipRow[])
          .map((membership) => membership.community_id)
          .filter(Boolean),
      ),
    );

    if (communityIds.length === 0) {
      return [];
    }

    let communitiesQuery = supabase
      .from('communities')
      .select('id, name, type, mobilepay_info, mobilepay_instructions')
      .in('id', communityIds);

    if (options?.communityType) {
      communitiesQuery = communitiesQuery.eq('type', options.communityType);
    }

    const { data: communities, error: communitiesError } = await communitiesQuery.order('name', {
      ascending: true,
    });

    if (communitiesError) {
      logger.warn('[fanActivities] Failed to resolve manageable community names:', {
        userId: normalizedUserId,
        error: communitiesError,
      });
      return [];
    }

    return toCommunityList((communities || []) as FanActivityCommunityRow[]);
  } catch (error) {
    logger.warn('[fanActivities] Unexpected manageable communities error:', {
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

  if (params.parentType === 'event') {
    if (!normalizedParentCommunityId) {
      return {
        community: null,
        source: 'unresolved',
        errorMessage: 'Eventet mangler et arrangør-community.',
      };
    }

    const manageableCommunities = await fetchManageableFanActivityCommunities(normalizedUserId);
    const parentCommunity =
      manageableCommunities.find((community) => community.id === normalizedParentCommunityId) ??
      null;

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

  if (normalizedParentCommunityId) {
    const manageableFanFactions = await fetchManageableFanActivityCommunities(normalizedUserId, {
      communityType: 'fan_faction',
    });
    const selectedCommunity =
      manageableFanFactions.find((community) => community.id === normalizedParentCommunityId) ??
      null;

    if (selectedCommunity) {
      return {
        community: selectedCommunity,
        source: 'explicit_selection',
        errorMessage: null,
      };
    }

    return {
      community: null,
      source: 'unresolved',
      errorMessage: 'Du kan kun oprette kampaktiviteter som en fanfraktion, du administrerer.',
    };
  }

  const manageableFanFactions = await fetchManageableFanActivityCommunities(normalizedUserId, {
    communityType: 'fan_faction',
  });

  if (manageableFanFactions.length === 0) {
    return {
      community: null,
      source: 'unresolved',
      errorMessage:
        'Du skal være owner eller admin i en fanfraktion for at oprette kampaktiviteter.',
    };
  }

  return {
    community: null,
    source: 'unresolved',
    errorMessage: 'Vælg hvilken fanfraktion der skal stå som arrangør.',
  };
}

export async function createFanActivity(input: CreateFanActivityInput): Promise<FanActivity> {
  const normalizedParentId = input.parentId.trim();
  const normalizedParentCommunityId = input.parentCommunityId?.trim() || null;
  const normalizedType = input.type.trim();
  const normalizedTitle = input.title.trim();
  const normalizedBody = input.body?.trim() || null;
  const normalizedLocationName = input.locationName?.trim() || null;
  const normalizedEndsAt = input.endsAt?.trim() || null;
  const normalizedCtaLabel = input.ctaLabel?.trim() || null;
  const normalizedCtaUrl = normalizeExternalUrl(input.ctaUrl);
  const registrationEnabled = input.registrationEnabled === true;
  const registrationCapacity = registrationEnabled
    ? Math.max(0, Math.trunc(Number(input.registrationCapacity ?? 0) || 0))
    : null;
  const registrationPriceDkk = registrationEnabled
    ? Math.max(0, Math.trunc(Number(input.registrationPriceDkk ?? 0) || 0))
    : 0;
  const registrationPaymentMode =
    registrationEnabled && registrationPriceDkk > 0 ? 'manual' : 'free';
  const registrationPaymentInstructions =
    registrationEnabled && registrationPaymentMode === 'manual'
      ? input.registrationPaymentInstructions?.trim() || null
      : null;
  const registrationMobilepayInfo =
    registrationEnabled && registrationPaymentMode === 'manual'
      ? input.registrationMobilepayInfo?.trim() || null
      : null;

  if (!normalizedParentId) {
    throw new Error('Parent-ID mangler.');
  }

  if (!normalizedType) {
    throw new Error('Type er påkrævet.');
  }

  if (!normalizedTitle) {
    throw new Error('Titel er påkrævet.');
  }

  if (registrationEnabled && !registrationCapacity) {
    throw new Error('Kapacitet er påkrævet, når tilmelding er slået til.');
  }

  if (registrationPaymentMode === 'manual' && !registrationMobilepayInfo) {
    throw new Error('MobilePay-info er påkrævet for betalingsaktiviteter.');
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

  if (input.parentType === 'event') {
    if (!normalizedParentCommunityId) {
      throw new Error('Eventet mangler et gyldigt arrangør-community.');
    }

    if (!normalizedCommunityId) {
      normalizedCommunityId = normalizedParentCommunityId;
    }

    if (normalizedCommunityId !== normalizedParentCommunityId) {
      throw new Error('Fanaktiviteten skal oprettes under eventets arrangør-community.');
    }

    const manageableCommunities = await fetchManageableFanActivityCommunities(user.id);
    const canManageParentCommunity = manageableCommunities.some(
      (community) => community.id === normalizedParentCommunityId,
    );

    if (!canManageParentCommunity) {
      throw new Error('Du kan ikke oprette fanaktiviteter for dette event-community.');
    }
  } else {
    if (!normalizedCommunityId) {
      throw new Error('Vælg hvilken fanfraktion der skal stå som arrangør.');
    }

    const manageableFanFactions = await fetchManageableFanActivityCommunities(user.id, {
      communityType: 'fan_faction',
    });
    const selectedCommunity = manageableFanFactions.find(
      (community) => community.id === normalizedCommunityId,
    );

    if (!selectedCommunity) {
      throw new Error('Du kan kun oprette kampaktiviteter som en fanfraktion, du administrerer.');
    }
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
    registration_enabled: registrationEnabled,
    registration_capacity: registrationCapacity,
    registration_price_dkk: registrationPriceDkk,
    registration_payment_mode: registrationPaymentMode,
    registration_payment_instructions: registrationPaymentInstructions,
    registration_mobilepay_info: registrationMobilepayInfo,
    is_published: true,
    is_cancelled: false,
  };

  const { data, error } = await supabase
    .from('fan_activities')
    .insert(insertPayload)
    .select(
      'id, parent_type, parent_id, community_id, created_by, type, title, body, starts_at, ends_at, location_name, location_address, lat, lng, cover_url, cta_label, cta_url, registration_enabled, registration_capacity, registration_price_dkk, registration_payment_mode, registration_payment_instructions, registration_mobilepay_info, is_published, is_cancelled, sort_order, created_at, updated_at',
    )
    .single();

  if (error) {
    throw error;
  }

  return withRegistrationSummary(
    toFanActivity({
      ...(data as Omit<FanActivityRow, 'communities'>),
      communities: null,
    }),
    {},
  );
}

export async function updateFanActivity(input: UpdateFanActivityInput): Promise<FanActivity> {
  const normalizedFanActivityId = input.fanActivityId.trim();
  const normalizedType = input.type.trim();
  const normalizedTitle = input.title.trim();
  const normalizedBody = input.body?.trim() || null;
  const normalizedLocationName = input.locationName?.trim() || null;
  const normalizedEndsAt = input.endsAt?.trim() || null;
  const normalizedCtaLabel = input.ctaLabel?.trim() || null;
  const normalizedCtaUrl = normalizeExternalUrl(input.ctaUrl);
  const registrationEnabled = input.registrationEnabled === true;
  const registrationCapacity = registrationEnabled
    ? Math.max(0, Math.trunc(Number(input.registrationCapacity ?? 0) || 0))
    : null;
  const registrationPriceDkk = registrationEnabled
    ? Math.max(0, Math.trunc(Number(input.registrationPriceDkk ?? 0) || 0))
    : 0;
  const registrationPaymentMode =
    registrationEnabled && registrationPriceDkk > 0 ? 'manual' : 'free';
  const registrationPaymentInstructions =
    registrationEnabled && registrationPaymentMode === 'manual'
      ? input.registrationPaymentInstructions?.trim() || null
      : null;
  const registrationMobilepayInfo =
    registrationEnabled && registrationPaymentMode === 'manual'
      ? input.registrationMobilepayInfo?.trim() || null
      : null;

  if (!normalizedFanActivityId) {
    throw new Error('Fanaktiviteten mangler et id.');
  }

  if (!normalizedType) {
    throw new Error('Type er påkrævet.');
  }

  if (!normalizedTitle) {
    throw new Error('Titel er påkrævet.');
  }

  if (registrationEnabled && !registrationCapacity) {
    throw new Error('Kapacitet er påkrævet, når tilmelding er slået til.');
  }

  if (registrationPaymentMode === 'manual' && !registrationMobilepayInfo) {
    throw new Error('MobilePay-info er påkrævet for betalingsaktiviteter.');
  }

  const updatePayload = {
    type: normalizedType,
    title: normalizedTitle,
    body: normalizedBody,
    starts_at: input.startsAt,
    ends_at: normalizedEndsAt,
    location_name: normalizedLocationName,
    cta_label: normalizedCtaLabel,
    cta_url: normalizedCtaUrl,
    registration_enabled: registrationEnabled,
    registration_capacity: registrationCapacity,
    registration_price_dkk: registrationPriceDkk,
    registration_payment_mode: registrationPaymentMode,
    registration_payment_instructions: registrationPaymentInstructions,
    registration_mobilepay_info: registrationMobilepayInfo,
  };

  const { data, error } = await supabase
    .from('fan_activities')
    .update(updatePayload)
    .eq('id', normalizedFanActivityId)
    .select(FAN_ACTIVITY_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const [hydratedActivity] = await hydrateFanActivitiesWithRegistrationSummaries([
    toFanActivity(data as FanActivityRow),
  ]);

  return hydratedActivity ?? withRegistrationSummary(toFanActivity(data as FanActivityRow), {});
}

export async function deleteFanActivity(fanActivityId: string): Promise<string> {
  const normalizedFanActivityId = fanActivityId.trim();
  if (!normalizedFanActivityId) {
    throw new Error('Fanaktiviteten mangler et id.');
  }

  const { data, error } = await supabase.rpc('delete_fan_activity', {
    p_fan_activity_id: normalizedFanActivityId,
  });

  if (error) {
    throw error;
  }

  if (typeof data !== 'string' || !data.trim()) {
    throw new Error('Fanaktiviteten kunne ikke slettes.');
  }

  return data;
}
