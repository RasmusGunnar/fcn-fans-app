import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

export type FanFactionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CommunityFanFactionRequest {
  id: string;
  community_id: string;
  requested_by: string;
  note: string | null;
  status: FanFactionRequestStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface PendingFanFactionRequestItem {
  id: string;
  community_id: string;
  community_name: string;
  community_location_label: string | null;
  requested_by: string;
  requested_by_name: string | null;
  note: string | null;
  created_at: string;
}

export type CreateFanFactionRequestResult = {
  request: CommunityFanFactionRequest | null;
  reason: 'ok' | 'already_pending' | 'not_authenticated' | 'error';
};

export async function getPendingRequestForCommunity(
  communityId: string,
): Promise<CommunityFanFactionRequest | null> {
  try {
    const { data, error } = await supabase
      .from('community_fan_faction_requests')
      .select('id, community_id, requested_by, note, status, created_at, reviewed_at, reviewed_by')
      .eq('community_id', communityId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (error) {
      logger.error('[fan-faction-requests] Error loading pending request:', error);
      return null;
    }

    return data;
  } catch (err) {
    logger.error('[fan-faction-requests] Unexpected load error:', err);
    return null;
  }
}

export async function createFanFactionRequest({
  communityId,
  note,
}: {
  communityId: string;
  note?: string | null;
}): Promise<CreateFanFactionRequestResult> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      logger.warn('[fan-faction-requests] User not authenticated');
      return { request: null, reason: 'not_authenticated' };
    }

    const { data, error } = await supabase
      .from('community_fan_faction_requests')
      .insert({
        community_id: communityId,
        requested_by: user.id,
        note: note?.trim() || null,
      })
      .select('id, community_id, requested_by, note, status, created_at, reviewed_at, reviewed_by')
      .single();

    if (error) {
      if (error.code === '23505') {
        logger.warn('[fan-faction-requests] Pending request already exists:', { communityId });
        return { request: null, reason: 'already_pending' };
      }

      logger.error('[fan-faction-requests] Error creating request:', error);
      return { request: null, reason: 'error' };
    }

    return { request: data, reason: 'ok' };
  } catch (err) {
    logger.error('[fan-faction-requests] Unexpected create error:', err);
    return { request: null, reason: 'error' };
  }
}

export async function listPendingRequests(): Promise<PendingFanFactionRequestItem[]> {
  try {
    const { data, error } = await supabase
      .from('community_fan_faction_requests')
      .select(
        'id, community_id, requested_by, note, created_at, communities!inner(id, name, location_label)',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('[fan-faction-requests] Error listing pending requests:', error);
      return [];
    }

    const rows = (data || []) as {
      id: string;
      community_id: string;
      requested_by: string;
      note: string | null;
      created_at: string;
      communities?:
        | {
            id: string;
            name: string;
            location_label: string | null;
          }
        | {
            id: string;
            name: string;
            location_label: string | null;
          }[]
        | null;
    }[];

    const requesterIds = Array.from(new Set(rows.map((row) => row.requested_by).filter(Boolean)));
    let requesterNamesById: Record<string, string | null> = {};

    if (requesterIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', requesterIds);

      if (profileError) {
        logger.warn('[fan-faction-requests] Could not load requester profile names:', profileError);
      } else {
        requesterNamesById = (profiles || []).reduce<Record<string, string | null>>((acc, p) => {
          acc[p.id] = p.display_name || null;
          return acc;
        }, {});
      }
    }

    return rows.map((row) => {
      const communityRel = Array.isArray(row.communities)
        ? row.communities[0]
        : row.communities;

      return {
        id: row.id,
        community_id: row.community_id,
        community_name: communityRel?.name || 'Ukendt fællesskab',
        community_location_label: communityRel?.location_label || null,
        requested_by: row.requested_by,
        requested_by_name: requesterNamesById[row.requested_by] || null,
        note: row.note,
        created_at: row.created_at,
      };
    });
  } catch (err) {
    logger.error('[fan-faction-requests] Unexpected pending list error:', err);
    return [];
  }
}

export async function approveRequest(requestId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('approve_fan_faction_request', {
      p_request_id: requestId,
    });

    if (error) {
      logger.error('[fan-faction-requests] Error approving request:', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[fan-faction-requests] Unexpected approve error:', err);
    return false;
  }
}

export async function rejectRequest(requestId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('reject_fan_faction_request', {
      p_request_id: requestId,
    });

    if (error) {
      logger.error('[fan-faction-requests] Error rejecting request:', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[fan-faction-requests] Unexpected reject error:', err);
    return false;
  }
}
