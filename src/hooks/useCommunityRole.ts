import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export type CommunityRole = 'owner' | 'admin' | 'member' | null;

// In-memory cache for community roles
const roleCache: Record<string, CommunityRole> = {};

/**
 * Hook to get the current user's role in a specific community.
 * Caches results in memory to avoid repeated DB calls.
 * Returns: 'owner' | 'admin' | 'member' | null
 */
export function useCommunityRole(communityId: string | null | undefined): {
  role: CommunityRole;
  loading: boolean;
} {
  const { user } = useAuth();
  const [role, setRole] = useState<CommunityRole>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchRole = async () => {
      if (!communityId || !user?.id) {
        setRole(null);
        return;
      }

      const cacheKey = `${user.id}:${communityId}`;

      // Check cache first
      if (roleCache[cacheKey] !== undefined) {
        if (mounted) setRole(roleCache[cacheKey]);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('community_members')
          .select('role')
          .eq('community_id', communityId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        const fetchedRole = (data?.role as CommunityRole) || null;
        roleCache[cacheKey] = fetchedRole;

        if (mounted) {
          setRole(fetchedRole);
        }
      } catch (e) {
        console.warn('[useCommunityRole] Error fetching role:', e);
        if (mounted) setRole(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchRole();

    return () => {
      mounted = false;
    };
  }, [communityId, user?.id]);

  return { role, loading };
}

/**
 * Synchronous role lookup from cache (use with caution - may not be loaded yet).
 * Returns the cached role or null if not cached.
 */
export function getCachedCommunityRole(userId: string, communityId: string): CommunityRole {
  const cacheKey = `${userId}:${communityId}`;
  return roleCache[cacheKey] ?? null;
}

/**
 * Clear the role cache (useful when community membership changes).
 */
export function clearCommunityRoleCache(userId?: string, communityId?: string) {
  if (userId && communityId) {
    const cacheKey = `${userId}:${communityId}`;
    delete roleCache[cacheKey];
  } else {
    // Clear all cache
    Object.keys(roleCache).forEach((key) => delete roleCache[key]);
  }
}
