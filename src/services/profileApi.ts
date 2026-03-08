import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { getProfileSafe } from '../lib/profile';

// ===== TYPES =====

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  member_since: string | null;
  onboarding_complete?: boolean | null;
}

export interface MyCommunity {
  id: string;
  name: string;
  type: 'community' | 'fan_faction';
  memberCount: number;
  role: 'owner' | 'admin' | 'member';
}

export interface UpcomingItem {
  id: string;
  targetType: 'match' | 'bus_trip' | 'event';
  targetId: string;
  title: string;
  date: string;
  status: 'going' | 'interested';
}

// ===== DATE FORMATTING =====

/**
 * Format date to Danish "marts 2023"
 */
export function formatMemberSince(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const formatter = new Intl.DateTimeFormat('da-DK', {
      month: 'long',
      year: 'numeric',
    });
    return formatter.format(date);
  } catch {
    return '';
  }
}

/**
 * Format date to Danish "Lørdag 25. januar, kl. 10:00"
 */
export function formatEventDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const dayFormatter = new Intl.DateTimeFormat('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const timeFormatter = new Intl.DateTimeFormat('da-DK', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const dayPart = dayFormatter.format(date);
    const timePart = timeFormatter.format(date);
    // Capitalize first letter
    return `${dayPart.charAt(0).toUpperCase() + dayPart.slice(1)}, kl. ${timePart}`;
  } catch {
    return '';
  }
}

// ===== API FUNCTIONS =====

/**
 * Fetch current user's profile
 */
export async function fetchMyProfile(userId: string): Promise<UserProfile | null> {
  try {
    return await getProfileSafe<UserProfile>(
      userId,
      'id, display_name, avatar_url, member_since, onboarding_complete',
    );
  } catch (err) {
    logger.error('[profileApi] Unexpected error fetching profile:', err);
    return null;
  }
}

/**
 * Fetch user's communities (owned + member)
 * Returns separate arrays for owner and member communities
 *
 * IMPORTANT: Uses public.community_members as authenticated user to match RLS policies
 */
export async function fetchMyCommunities(
  userId: string,
): Promise<{ ownerCommunities: MyCommunity[]; memberCommunities: MyCommunity[] }> {
  try {
    logger.log('[profileApi] Fetching communities for user:', userId);

    // Step 1: Fetch community memberships from community_members as authenticated user
    // This matches RLS: select community_id, role from public.community_members where user_id = auth.uid()
    const { data: memberships, error: memberError } = await supabase
      .from('community_members')
      .select('community_id, role')
      .eq('user_id', userId);

    if (memberships && memberships.length > 0) {
      logger.log('[profileApi] Memberships found:', memberships.length);
    } else {
      logger.log('[profileApi] No community memberships found');
    }

    if (memberError) {
      logger.log('[profileApi] Query error:', memberError);
      logger.warn('[profileApi] Error fetching communities', memberError);
      return { ownerCommunities: [], memberCommunities: [] };
    }

    if (!memberships || memberships.length === 0) {
      logger.log('[profileApi] No community memberships found - ActorSelector will show 0 communities');
      return { ownerCommunities: [], memberCommunities: [] };
    }

    // Filter to owner/admin only (case-insensitive)
    const eligibleMemberships = memberships.filter(
      (m) => m.role?.toLowerCase() === 'owner' || m.role?.toLowerCase() === 'admin',
    );

    logger.log('[profileApi] Eligible memberships (owner/admin):', eligibleMemberships.length);

    if (eligibleMemberships.length === 0) {
      return { ownerCommunities: [], memberCommunities: [] };
    }

    // Step 2: Fetch community names from communities table
    const communityIds = eligibleMemberships.map((m) => m.community_id);
    const { data: communities, error: communitiesError } = await supabase
      .from('communities')
      .select('id, name, type')
      .in('id', communityIds);

    if (communitiesError) {
      logger.warn('[profileApi] Error fetching community names:', communitiesError);
      // Fallback: use community_id as name
    }

    logger.log('[profileApi] Fetched community names:', communities?.length || 0);

    // Step 3: Get member counts for each community
    const countsMap: Record<string, number> = {};
    await Promise.all(
      communityIds.map(async (communityId: string) => {
        const { count, error } = await supabase
          .from('community_members')
          .select('*', { count: 'exact', head: true })
          .eq('community_id', communityId);

        if (!error && count !== null) {
          countsMap[communityId] = count;
        }
      }),
    );

    // Step 4: Map to MyCommunity objects
    const ownerCommunities: MyCommunity[] = [];
    const memberCommunities: MyCommunity[] = [];

    eligibleMemberships.forEach((m: any) => {
      const communityData = communities?.find((c) => c.id === m.community_id);

      const community: MyCommunity = {
        id: m.community_id,
        name: communityData?.name || m.community_id, // Fallback to ID if name not found
        type: communityData?.type || 'community',
        memberCount: countsMap[m.community_id] || 0,
        role: m.role?.toLowerCase() === 'owner' ? 'owner' : 'admin',
      };

      if (m.role?.toLowerCase() === 'owner') {
        ownerCommunities.push(community);
      } else {
        memberCommunities.push(community);
      }
    });

    logger.log('[profileApi] Final result:', {
      ownerCommunities: ownerCommunities.length,
      memberCommunities: memberCommunities.length,
    });

    logger.log('[profileApi] Final owner/admin communities for dropdown:');
    if (ownerCommunities.length > 0) {
      ownerCommunities.forEach((c, idx) => {
        logger.log(`  Community ${idx + 1}:`, {
          id: c.id,
          name: c.name,
          role: c.role,
        });
      });
    } else {
      logger.log('  (0 communities - dropdown will only show "Dig")');
    }

    return { ownerCommunities, memberCommunities };
  } catch (err) {
    logger.error('[profileApi] Unexpected error fetching communities:', err);
    return { ownerCommunities: [], memberCommunities: [] };
  }
}

/**
 * Fetch user's upcoming items (matches, bus trips, events)
 * Returns up to 3 items with resolved titles and dates
 */
export async function fetchMyUpcomingItems(userId: string): Promise<UpcomingItem[]> {
  try {
    logger.log('[profileApi] Fetching upcoming items for user:', userId);
    // Fetch user_upcoming_items
    const { data: items, error: itemsError } = await supabase
      .from('user_upcoming_items')
      .select('id, target_type, target_id, status, created_at')
      .eq('user_id', userId)
      .in('status', ['going', 'interested'])
      .order('created_at', { ascending: false })
      .limit(3);

    if (itemsError) {
      logger.warn('[profileApi] Error fetching upcoming items', itemsError);
      return [];
    }

    logger.log('[profileApi] Found items:', items?.length || 0);

    if (!items || items.length === 0) {
      return [];
    }

    // Resolve titles and dates
    const resolved = await Promise.all(
      items.map(async (item: any) => {
        let title = '';
        let date = '';

        if (item.target_type === 'match') {
          const { data: match } = await supabase
            .from('fixtures')
            .select('id, kickoff_at, home_team, away_team, venue')
            .eq('id', item.target_id)
            .maybeSingle();

          if (match) {
            title = `${match.home_team} vs ${match.away_team}`;
            date = match.kickoff_at;
          }
        } else if (item.target_type === 'bus_trip') {
          const { data: busTrip } = await supabase
            .from('bus_trips')
            .select('id, title, start_at')
            .eq('id', item.target_id)
            .maybeSingle();

          if (busTrip) {
            title = busTrip.title;
            date = busTrip.start_at;
          }
        } else if (item.target_type === 'event') {
          const { data: event } = await supabase
            .from('events')
            .select('id, title, start_at')
            .eq('id', item.target_id)
            .maybeSingle();

          if (event) {
            title = event.title;
            date = event.start_at;
          }
        }

        return {
          id: item.id,
          targetType: item.target_type,
          targetId: item.target_id,
          title: title || 'Ukendt event',
          date: date || '',
          status: item.status,
        };
      }),
    );

    // Filter out items that couldn't be resolved
    return resolved.filter((item) => item.title && item.date);
  } catch (err) {
    logger.error('[profileApi] Unexpected error fetching upcoming items:', err);
    return [];
  }
}

/**
 * Count communities owned by user
 */
export async function countOwnedCommunities(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('community_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (error) {
      logger.warn('[profileApi] Error counting owned communities', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    logger.error('[profileApi] Unexpected error counting communities:', err);
    return 0;
  }
}
