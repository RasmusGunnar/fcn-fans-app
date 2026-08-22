/**
 * RBAC Service - Role-Based Access Control
 *
 * System roles:
 * - System admin: Full access to all resources (managed via app_admins table)
 * - Community owner/admin: Can manage community content and profile
 * - Member: Can view and interact with community content
 * - User: Can manage own content only
 */

import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { isDemoMode } from '../config/appMode';
import { DEMO_COMMUNITIES, DEMO_COMMUNITY_ROLE_MAP } from '../demo/communities';

export const WILD_TIGERS_COMMUNITY_NAME = 'Wild Tigers';

function normalizeCommunityName(name: string | null | undefined): string {
  return name?.trim().toLowerCase() ?? '';
}

/**
 * Check if current user is a system administrator
 * System admins have full access to all resources
 */
export async function isSystemAdmin(): Promise<boolean> {
  if (isDemoMode) return false;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const { data, error } = await supabase
      .from('app_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // Not found or table doesn't exist yet - not an admin
      return false;
    }

    return !!data;
  } catch (err) {
    logger.error('Error checking system admin status:', err);
    return false;
  }
}

/**
 * Get current user's roles in all their communities
 * Returns a map of community_id -> role
 */
export async function getMyCommunityRoles(): Promise<Record<string, 'owner' | 'admin' | 'member'>> {
  if (isDemoMode) return { ...DEMO_COMMUNITY_ROLE_MAP };
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {};
    }

    const { data, error } = await supabase
      .from('community_members')
      .select('community_id, role')
      .eq('user_id', user.id);

    if (error) {
      logger.error('Error fetching community roles:', error);
      return {};
    }

    const roleMap: Record<string, 'owner' | 'admin' | 'member'> = {};
    data?.forEach((membership) => {
      roleMap[membership.community_id] = membership.role as 'owner' | 'admin' | 'member';
    });

    return roleMap;
  } catch (err) {
    logger.error('Error in getMyCommunityRoles:', err);
    return {};
  }
}

/**
 * Get current user's role in a community identified by name.
 * Reuses the existing membership lookup and resolves the community name with a narrow query.
 */
export async function getMyCommunityRoleByName(
  communityName: string,
): Promise<'owner' | 'admin' | 'member' | null> {
  if (isDemoMode) {
    const community = DEMO_COMMUNITIES.find(
      (item) => normalizeCommunityName(item.name) === normalizeCommunityName(communityName),
    );
    return community ? (DEMO_COMMUNITY_ROLE_MAP[community.id] ?? null) : null;
  }
  try {
    const roleMap = await getMyCommunityRoles();
    const communityIds = Object.keys(roleMap);

    if (communityIds.length === 0) {
      return null;
    }

    const normalizedTargetName = normalizeCommunityName(communityName);
    const { data, error } = await supabase
      .from('communities')
      .select('id, name')
      .in('id', communityIds);

    if (error) {
      logger.error('Error fetching community names for role lookup:', error);
      return null;
    }

    const matchedCommunity = data?.find(
      (community) => normalizeCommunityName(community.name) === normalizedTargetName,
    );

    return matchedCommunity ? (roleMap[matchedCommunity.id] ?? null) : null;
  } catch (err) {
    logger.error('Error in getMyCommunityRoleByName:', err);
    return null;
  }
}

/**
 * Check if user can post content as a community
 * Only owners and admins can post as community
 */
export function canPostAsCommunity(role: 'owner' | 'admin' | 'member' | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Check if user can manage community settings
 * Only owners and admins can manage community
 */
export function canManageCommunity(role: 'owner' | 'admin' | 'member' | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Check if user can assign admin role in a community
 * Only owners can promote members to admin
 */
export function canAssignAdmin(role: 'owner' | 'admin' | 'member' | undefined): boolean {
  return role === 'owner';
}
