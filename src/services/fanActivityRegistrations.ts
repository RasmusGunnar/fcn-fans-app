import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

export type FanActivityRegistrationStatus =
  | 'pending_payment'
  | 'pending_verification'
  | 'confirmed';

export type FanActivityRegistrationSummary = {
  reservedCount: number;
  confirmedCount: number;
  pendingVerificationCount: number;
  pendingPaymentCount: number;
};

export type FanActivityRegistration = {
  id: string;
  fanActivityId: string;
  userId: string;
  status: FanActivityRegistrationStatus;
  paymentReference: string;
  userMarkedPaidAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FanActivityRegistrationAdminEntry = FanActivityRegistration & {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type FanActivityRegistrationListItem = FanActivityRegistration & {
  activityTitle: string | null;
  activityStartsAt: string | null;
  activityLocationName: string | null;
  activityLocationAddress: string | null;
  communityId: string | null;
  communityName: string | null;
  registrationPaymentMode: 'free' | 'manual' | null;
  registrationPriceDkk: number | null;
  registrationMobilepayInfo: string | null;
  registrationPaymentInstructions: string | null;
};

type FanActivityRegistrationSnapshotRow = {
  fan_activity_id: string;
  reserved_count: number | null;
  confirmed_count: number | null;
  pending_verification_count: number | null;
  pending_payment_count: number | null;
};

type FanActivityRegistrationRow = {
  id: string;
  fan_activity_id: string;
  user_id: string;
  status: FanActivityRegistrationStatus;
  payment_reference: string;
  user_marked_paid_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type CommunityRow = {
  id: string;
  name: string | null;
};

type FanActivityRegistrationActivityRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  location_name: string | null;
  location_address: string | null;
  community_id: string | null;
  registration_payment_mode: 'free' | 'manual' | null;
  registration_price_dkk: number | null;
  registration_mobilepay_info: string | null;
  registration_payment_instructions: string | null;
  communities?: CommunityRow | CommunityRow[] | null;
};

type FanActivityRegistrationListRow = FanActivityRegistrationRow & {
  fan_activities?: FanActivityRegistrationActivityRow | null;
};

const EMPTY_SUMMARY: FanActivityRegistrationSummary = {
  reservedCount: 0,
  confirmedCount: 0,
  pendingVerificationCount: 0,
  pendingPaymentCount: 0,
};

function isMissingRegistrationInfra(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : null;
  const message =
    typeof error === 'object' && error !== null ? String((error as { message?: string }).message ?? '') : '';

  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
}

function toSummary(
  row?: Partial<FanActivityRegistrationSnapshotRow> | null,
): FanActivityRegistrationSummary {
  return {
    reservedCount: Math.max(0, Number(row?.reserved_count ?? 0) || 0),
    confirmedCount: Math.max(0, Number(row?.confirmed_count ?? 0) || 0),
    pendingVerificationCount: Math.max(0, Number(row?.pending_verification_count ?? 0) || 0),
    pendingPaymentCount: Math.max(0, Number(row?.pending_payment_count ?? 0) || 0),
  };
}

function toRegistration(row: FanActivityRegistrationRow): FanActivityRegistration {
  return {
    id: row.id,
    fanActivityId: row.fan_activity_id,
    userId: row.user_id,
    status: row.status,
    paymentReference: row.payment_reference,
    userMarkedPaidAt: row.user_marked_paid_at ?? null,
    verifiedAt: row.verified_at ?? null,
    verifiedBy: row.verified_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCommunity(
  community?: CommunityRow | CommunityRow[] | null,
): CommunityRow | null {
  if (!community) {
    return null;
  }

  return Array.isArray(community) ? community[0] ?? null : community;
}

function toRegistrationListItem(row: FanActivityRegistrationListRow): FanActivityRegistrationListItem {
  const base = toRegistration(row);
  const activity = row.fan_activities ?? null;
  const community = normalizeCommunity(activity?.communities ?? null);

  return {
    ...base,
    activityTitle: activity?.title ?? null,
    activityStartsAt: activity?.starts_at ?? null,
    activityLocationName: activity?.location_name ?? null,
    activityLocationAddress: activity?.location_address ?? null,
    communityId: activity?.community_id ?? community?.id ?? null,
    communityName: community?.name ?? null,
    registrationPaymentMode: activity?.registration_payment_mode ?? null,
    registrationPriceDkk:
      typeof activity?.registration_price_dkk === 'number'
        ? activity.registration_price_dkk
        : null,
    registrationMobilepayInfo: activity?.registration_mobilepay_info ?? null,
    registrationPaymentInstructions: activity?.registration_payment_instructions ?? null,
  };
}

function normalizeActivityIds(activityIds: string[]): string[] {
  return Array.from(
    new Set(
      activityIds
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

async function callSingleRegistrationRpc(
  functionName:
    | 'create_fan_activity_registration'
    | 'mark_fan_activity_registration_paid'
    | 'admin_update_fan_activity_registration_status',
  params: Record<string, unknown>,
): Promise<FanActivityRegistration> {
  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? (data as FanActivityRegistrationRow[]) : [];
  const row = rows[0];

  if (!row?.id) {
    throw new Error('Kunne ikke læse tilmeldingen tilbage.');
  }

  return toRegistration(row);
}

export function getEmptyFanActivityRegistrationSummary(): FanActivityRegistrationSummary {
  return { ...EMPTY_SUMMARY };
}

export async function fetchFanActivityRegistrationSummaries(
  activityIds: string[],
): Promise<Record<string, FanActivityRegistrationSummary>> {
  const normalizedActivityIds = normalizeActivityIds(activityIds);
  if (normalizedActivityIds.length === 0) {
    return {};
  }

  try {
    const { data, error } = await supabase.rpc('get_fan_activity_registration_snapshots', {
      p_activity_ids: normalizedActivityIds,
    });

    if (error) {
      if (isMissingRegistrationInfra(error)) {
        logger.warn('[fanActivityRegistrations] Snapshot RPC not available yet.');
        return {};
      }

      logger.warn('[fanActivityRegistrations] Snapshot RPC failed:', {
        activityIds: normalizedActivityIds,
        error,
      });
      return {};
    }

    return ((data || []) as FanActivityRegistrationSnapshotRow[]).reduce<
      Record<string, FanActivityRegistrationSummary>
    >((acc, row) => {
      if (row?.fan_activity_id) {
        acc[row.fan_activity_id] = toSummary(row);
      }
      return acc;
    }, {});
  } catch (error) {
    logger.warn('[fanActivityRegistrations] Unexpected snapshot fetch error:', {
      activityIds: normalizedActivityIds,
      error,
    });
    return {};
  }
}

export async function fetchMyFanActivityRegistration(
  fanActivityId: string,
): Promise<FanActivityRegistration | null> {
  const normalizedFanActivityId = fanActivityId.trim();
  if (!normalizedFanActivityId) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from('fan_activity_registrations')
    .select(
      'id, fan_activity_id, user_id, status, payment_reference, user_marked_paid_at, verified_at, verified_by, created_at, updated_at',
    )
    .eq('fan_activity_id', normalizedFanActivityId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    if (isMissingRegistrationInfra(error)) {
      return null;
    }
    throw error;
  }

  if (!data) {
    return null;
  }

  return toRegistration(data as FanActivityRegistrationRow);
}

export async function fetchFanActivityAdminRegistrations(
  fanActivityId: string,
): Promise<FanActivityRegistrationAdminEntry[]> {
  const normalizedFanActivityId = fanActivityId.trim();
  if (!normalizedFanActivityId) {
    return [];
  }

  const { data, error } = await supabase
    .from('fan_activity_registrations')
    .select(
      'id, fan_activity_id, user_id, status, payment_reference, user_marked_paid_at, verified_at, verified_by, created_at, updated_at',
    )
    .eq('fan_activity_id', normalizedFanActivityId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRegistrationInfra(error)) {
      return [];
    }
    throw error;
  }

  const registrations = ((data || []) as FanActivityRegistrationRow[]).map(toRegistration);
  const userIds = Array.from(new Set(registrations.map((entry) => entry.userId).filter(Boolean)));

  let profileMap: Record<string, ProfileRow> = {};
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', userIds);

    if (profilesError) {
      throw profilesError;
    }

    profileMap = ((profiles || []) as ProfileRow[]).reduce<Record<string, ProfileRow>>((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});
  }

  const statusOrder: Record<FanActivityRegistrationStatus, number> = {
    pending_verification: 0,
    pending_payment: 1,
    confirmed: 2,
  };

  return registrations
    .map((entry) => ({
      ...entry,
      displayName: profileMap[entry.userId]?.display_name ?? null,
      username: profileMap[entry.userId]?.username ?? null,
      avatarUrl: profileMap[entry.userId]?.avatar_url ?? null,
    }))
    .sort((left, right) => {
      const statusDiff = statusOrder[left.status] - statusOrder[right.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
}

export async function fetchMyFanActivityRegistrations(): Promise<FanActivityRegistrationListItem[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return [];
  }

  const { data, error } = await supabase
    .from('fan_activity_registrations')
    .select(
      'id, fan_activity_id, user_id, status, payment_reference, user_marked_paid_at, verified_at, verified_by, created_at, updated_at, fan_activities(id, title, starts_at, location_name, location_address, community_id, registration_payment_mode, registration_price_dkk, registration_mobilepay_info, registration_payment_instructions, communities(id, name))',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingRegistrationInfra(error)) {
      return [];
    }
    throw error;
  }

  return ((data || []) as FanActivityRegistrationListRow[]).map(toRegistrationListItem);
}

export async function fetchMyFanActivityRegistrationDetail(
  registrationId: string,
): Promise<FanActivityRegistrationListItem | null> {
  const normalizedRegistrationId = registrationId.trim();
  if (!normalizedRegistrationId) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from('fan_activity_registrations')
    .select(
      'id, fan_activity_id, user_id, status, payment_reference, user_marked_paid_at, verified_at, verified_by, created_at, updated_at, fan_activities(id, title, starts_at, location_name, location_address, community_id, registration_payment_mode, registration_price_dkk, registration_mobilepay_info, registration_payment_instructions, communities(id, name))',
    )
    .eq('id', normalizedRegistrationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    if (isMissingRegistrationInfra(error)) {
      return null;
    }
    throw error;
  }

  if (!data) {
    return null;
  }

  return toRegistrationListItem(data as FanActivityRegistrationListRow);
}

export async function createFanActivityRegistration(
  fanActivityId: string,
): Promise<FanActivityRegistration> {
  const normalizedFanActivityId = fanActivityId.trim();
  if (!normalizedFanActivityId) {
    throw new Error('Aktiviteten mangler et id.');
  }

  return callSingleRegistrationRpc('create_fan_activity_registration', {
    p_fan_activity_id: normalizedFanActivityId,
  });
}

export async function markFanActivityRegistrationPaid(
  fanActivityId: string,
): Promise<FanActivityRegistration> {
  const normalizedFanActivityId = fanActivityId.trim();
  if (!normalizedFanActivityId) {
    throw new Error('Aktiviteten mangler et id.');
  }

  return callSingleRegistrationRpc('mark_fan_activity_registration_paid', {
    p_fan_activity_id: normalizedFanActivityId,
  });
}

export async function adminUpdateFanActivityRegistrationStatus(params: {
  registrationId: string;
  status: FanActivityRegistrationStatus;
}): Promise<FanActivityRegistration> {
  const normalizedRegistrationId = params.registrationId.trim();
  if (!normalizedRegistrationId) {
    throw new Error('Tilmeldingen mangler et id.');
  }

  return callSingleRegistrationRpc('admin_update_fan_activity_registration_status', {
    p_registration_id: normalizedRegistrationId,
    p_status: params.status,
  });
}
