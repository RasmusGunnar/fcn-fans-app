import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Alert } from 'react-native';

// ===== TYPES =====

export interface Community {
  id: string;
  name: string;
  mention_key: string | null;
  description: string | null;
  type: 'community' | 'fan_faction';
  owner_id: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
  avatar_kind: 'logo' | 'image' | null;
  cover_path: string | null;
  location_label: string | null;
  location_geohash: string | null;
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  geocoded_at: string | null;
  visibility: 'public' | 'private';
  created_at: string;
  created_by: string | null;
  mobilepay_info?: string | null;
  mobilepay_instructions?: string | null;
  member_count?: number;
}

export interface CommunityMembership {
  id: string;
  community_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

/**
 * Ensure avatar_url is populated from avatar_path if missing
 */
function ensureAvatarUrl(community: Community): Community {
  if (community.avatar_path && !community.avatar_url) {
    const { data } = supabase.storage.from('avatars').getPublicUrl(community.avatar_path);
    community.avatar_url = data.publicUrl;
  }
  return community;
}

// ===== HELPER FUNCTIONS =====

/**
 * Convert base64 string to Uint8Array for reliable Supabase uploads
 */
function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate crypto-random filename component
 */
async function cryptoRandom(): Promise<string> {
  return Crypto.randomUUID();
}

export const COMMUNITY_MEDIA_BUCKET = 'community-media';
const COMMUNITY_COVER_MAX_WIDTH = 1600;
const WILD_TIGERS_COMMUNITY_NAME = 'wild tigers';

function hasMissingCommunityColumnError(
  error: { message?: string | null } | null,
  column: string,
): boolean {
  const message = error?.message?.toLowerCase() ?? '';
  return message.includes(column.toLowerCase()) && message.includes('column');
}

async function fetchBaseCommunitiesRows(): Promise<{
  data: Community[] | null;
  error: { message?: string | null } | null;
  appliedFilters: string;
}> {
  const attempts = [
    {
      appliedFilters: 'visibility + is_active + is_deleted + is_hidden',
      columns: ['visibility', 'is_active', 'is_deleted', 'is_hidden'],
      run: () =>
        supabase
          .from('communities')
          .select('*')
          .or('visibility.eq.public,visibility.is.null')
          .eq('is_active', true)
          .not('is_deleted', 'is', 'true')
          .not('is_hidden', 'is', 'true')
          .order('name', { ascending: true }),
    },
    {
      appliedFilters: 'visibility + is_active + is_deleted',
      columns: ['visibility', 'is_active', 'is_deleted'],
      run: () =>
        supabase
          .from('communities')
          .select('*')
          .or('visibility.eq.public,visibility.is.null')
          .eq('is_active', true)
          .not('is_deleted', 'is', 'true')
          .order('name', { ascending: true }),
    },
    {
      appliedFilters: 'visibility + is_active',
      columns: ['visibility', 'is_active'],
      run: () =>
        supabase
          .from('communities')
          .select('*')
          .or('visibility.eq.public,visibility.is.null')
          .eq('is_active', true)
          .order('name', { ascending: true }),
    },
    {
      appliedFilters: 'is_active + is_deleted + is_hidden',
      columns: ['is_active', 'is_deleted', 'is_hidden'],
      run: () =>
        supabase
          .from('communities')
          .select('*')
          .eq('is_active', true)
          .not('is_deleted', 'is', 'true')
          .not('is_hidden', 'is', 'true')
          .order('name', { ascending: true }),
    },
    {
      appliedFilters: 'is_active + is_deleted',
      columns: ['is_active', 'is_deleted'],
      run: () =>
        supabase
          .from('communities')
          .select('*')
          .eq('is_active', true)
          .not('is_deleted', 'is', 'true')
          .order('name', { ascending: true }),
    },
    {
      appliedFilters: 'is_active',
      columns: ['is_active'],
      run: () =>
        supabase.from('communities').select('*').eq('is_active', true).order('name', {
          ascending: true,
        }),
    },
    {
      appliedFilters: 'visibility only',
      columns: ['visibility'],
      run: () =>
        supabase
          .from('communities')
          .select('*')
          .or('visibility.eq.public,visibility.is.null')
          .order('name', { ascending: true }),
    },
    {
      appliedFilters: 'legacy fallback',
      columns: [],
      run: () => supabase.from('communities').select('*').order('name', { ascending: true }),
    },
  ] as const;

  let lastError: { message?: string | null } | null = null;

  for (const attempt of attempts) {
    const { data, error } = await attempt.run();

    if (!error) {
      return {
        data: (data as Community[] | null) ?? [],
        error: null,
        appliedFilters: attempt.appliedFilters,
      };
    }

    lastError = error;
    const missingColumn = attempt.columns.find((column) =>
      hasMissingCommunityColumnError(error, column),
    );

    if (!missingColumn) {
      return {
        data: null,
        error,
        appliedFilters: attempt.appliedFilters,
      };
    }

    logger.warn('[communities] Base query column unavailable, retrying with fallback filters:', {
      missingColumn,
      attemptedFilters: attempt.appliedFilters,
      message: error.message,
    });
  }

  return {
    data: null,
    error: lastError,
    appliedFilters: 'unresolved fallback',
  };
}

export function sortCommunities(communities: Community[]): Community[] {
  const typeRank = (community: Community) => (community.type === 'fan_faction' ? 0 : 1);
  const isWildTigers = (community: Community) =>
    community.name?.trim().toLowerCase() === WILD_TIGERS_COMMUNITY_NAME;

  return [...communities].sort((a, b) => {
    const typeDiff = typeRank(a) - typeRank(b);
    if (typeDiff !== 0) return typeDiff;

    const aIsWild = isWildTigers(a) ? 0 : 1;
    const bIsWild = isWildTigers(b) ? 0 : 1;
    if (aIsWild !== bIsWild) return aIsWild - bIsWild;

    const aName = a.name?.toLowerCase() ?? '';
    const bName = b.name?.toLowerCase() ?? '';
    return aName.localeCompare(bName, 'da');
  });
}

// ===== API FUNCTIONS =====

/**
 * Get member count for a community
 */
export async function getMemberCount(communityId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('community_members')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId);

    if (error) {
      logger.warn('[communities] Error fetching member count:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return 0;
  }
}

/**
 * Get member counts for multiple communities
 * Returns a map of community_id -> member count
 */
export async function getMemberCounts(communityIds: string[]): Promise<Record<string, number>> {
  try {
    if (communityIds.length === 0) return {};

    const { data, error } = await supabase
      .from('community_members')
      .select('community_id')
      .in('community_id', communityIds);

    if (error) {
      logger.warn('[communities] Error fetching member counts:', error);
      return {};
    }

    // Count members per community
    const counts: Record<string, number> = {};
    (data || []).forEach((member) => {
      counts[member.community_id] = (counts[member.community_id] || 0) + 1;
    });

    return counts;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return {};
  }
}

/**
 * Get the shared base communities dataset used across app filters.
 */
export async function getCommunities(): Promise<Community[]> {
  try {
    const { data, error, appliedFilters } = await fetchBaseCommunitiesRows();

    if (error) {
      logger.warn('[communities] Error fetching communities:', error);
      return [];
    }

    // Ensure avatar_url is populated for each community
    const baseCommunities = (data || []).map(ensureAvatarUrl);

    // Fetch member counts for all communities
    const communityIds = baseCommunities.map((c) => c.id);
    const memberCounts = await getMemberCounts(communityIds);

    // Attach member counts to communities
    const communitiesWithCounts = baseCommunities.map((community) => ({
      ...community,
      member_count: memberCounts[community.id] || 0,
    }));

    const sortedCommunities = sortCommunities(communitiesWithCounts);

    logger.log('[communities] Loaded base communities dataset:', {
      appliedFilters,
      count: sortedCommunities.length,
    });

    return sortedCommunities;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return [];
  }
}

/**
 * Get single community by ID
 */
export async function getCommunity(id: string): Promise<Community | null> {
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.warn('[communities] Error fetching community:', error);
      return null;
    }

    // Ensure avatar_url is populated
    return data ? ensureAvatarUrl(data) : null;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return null;
  }
}

/**
 * Get current user's membership for a community
 */
export async function getMembership(communityId: string): Promise<CommunityMembership | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn('[communities] User not authenticated');
      return null;
    }

    const { data, error } = await supabase
      .from('community_members')
      .select('*')
      .eq('community_id', communityId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.warn('[communities] Error fetching membership:', error);
      return null;
    }

    return data;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return null;
  }
}

/**
 * Join a community (as member)
 */
export async function joinCommunity(communityId: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn('[communities] User not authenticated');
      return false;
    }

    const { error } = await supabase.from('community_members').insert({
      community_id: communityId,
      user_id: user.id,
      role: 'member',
    });

    if (error) {
      logger.error('[communities] Error joining community:', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return false;
  }
}

/**
 * Create a new community with proper ownership setup
 * @param name - Community name (required)
 * @param description - Community description (optional)
 * @param type - Community type ('community' or 'fan_faction')
 * @param visibility - Visibility ('public' or 'private')
 * @returns Created community or null on error
 */
export async function createCommunity(
  name: string,
  description: string | null,
  type: 'community' | 'fan_faction' = 'community',
  visibility: 'public' | 'private' = 'public',
  locationData?: {
    location_label?: string | null;
    lat?: number | null;
    lng?: number | null;
    place_name?: string | null;
    geocoded_at?: string | null;
  },
): Promise<Community | null> {
  try {
    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn('[communities] User not authenticated');
      return null;
    }

    // Create community with owner_id set
    const { data: community, error: communityError } = await supabase
      .from('communities')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        type,
        owner_id: user.id,
        visibility,
        created_by: user.id,
        location_label: locationData?.location_label || null,
        lat: locationData?.lat || null,
        lng: locationData?.lng || null,
        place_name: locationData?.place_name || null,
        geocoded_at: locationData?.geocoded_at || null,
      })
      .select()
      .single();

    if (communityError) {
      logger.error('[communities] Error creating community:', communityError);
      return null;
    }

    // Create owner membership record (defensive check for duplicates)
    const { error: membershipError } = await supabase
      .from('community_members')
      .insert({
        community_id: community.id,
        user_id: user.id,
        role: 'owner',
      })
      .select()
      .single();

    if (membershipError) {
      // Check if it's a duplicate error (constraint violation)
      if (membershipError.code === '23505') {
        logger.log('[communities] Owner membership already exists');
      } else {
        logger.error('[communities] Error creating owner membership:', membershipError);
        // Continue anyway - community is created, membership can be fixed later
      }
    }

    logger.log('[communities] Successfully created community:', {
      id: community.id,
      name: community.name,
      owner_id: community.owner_id,
      location_label: community.location_label,
      lat: community.lat,
      lng: community.lng,
    });

    return ensureAvatarUrl(community);
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return null;
  }
}

/**
 * Leave a community (delete membership)
 */
export async function leaveCommunity(communityId: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn('[communities] User not authenticated');
      return false;
    }

    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', user.id);

    if (error) {
      logger.warn('[communities] Error leaving community:', error);
      return false;
    }

    logger.log('[communities] Successfully left community:', communityId);
    return true;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return false;
  }
}

/**
 * List all members of a community (with profile info if available)
 */
export async function listMembers(communityId: string): Promise<CommunityMember[]> {
  try {
    // First get memberships
    const { data: memberships, error: memberError } = await supabase
      .from('community_members')
      .select('*')
      .eq('community_id', communityId)
      .order('joined_at', { ascending: false });

    if (memberError) {
      logger.warn('[communities] Error fetching members:', memberError);
      throw memberError;
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    // Get profile info for all members
    const userIds = memberships.map((m) => m.user_id);
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    if (profileError) {
      logger.warn('[communities] Error fetching profiles:', profileError);
      // Return without profile info
      return memberships;
    }

    // Merge memberships with profiles
    const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

    return memberships.map((m) => {
      const profile = profilesMap.get(m.user_id);
      return {
        ...m,
        display_name: profile?.display_name || null,
        avatar_url: profile?.avatar_url || null,
      };
    });
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    throw err;
  }
}

/**
 * Set member role (owner only)
 * @param communityId - The community ID
 * @param userId - The user ID to update
 * @param role - New role ('admin' or 'member')
 */
export async function setMemberRole(
  communityId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('community_members')
      .update({ role })
      .eq('community_id', communityId)
      .eq('user_id', userId);

    if (error) {
      logger.warn('[communities] Error updating member role:', error);
      return false;
    }

    logger.log('[communities] Successfully updated role:', { userId, role });
    return true;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    return false;
  }
}

/**
 * Upload community avatar (logo or image)
 * @param communityId - The community ID
 * @param fileUri - Optional file URI (if not provided, launches image picker)
 * @param kind - Avatar kind ('logo' for fan_faction, 'image' for community)
 */
export async function uploadCommunityAvatar(
  communityId: string,
  fileUri: string | null,
  kind: 'logo' | 'image',
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn('[communities] User not authenticated');
      return false;
    }

    let pickedUri = fileUri;

    // If no URI provided, launch image picker
    if (!pickedUri) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        logger.warn('[communities] Permission denied');
        return false;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        base64: false,
      });

      if (result.canceled) {
        return false;
      }

      pickedUri = result.assets[0].uri;
    }

    // Validate file exists
    const fileInfo = await FileSystem.getInfoAsync(pickedUri);
    if (!fileInfo.exists || fileInfo.size === 0) {
      Alert.alert('Fejl', 'Filen kunne ikke findes eller er tom');
      return false;
    }

    logger.log('[communities] Converting image to JPEG');

    // Convert to JPEG
    const manipResult = await ImageManipulator.manipulateAsync(
      pickedUri,
      [{ resize: { width: 512 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    const base64 = manipResult.base64;

    if (!base64) {
      throw new Error('Failed to get base64 data from image');
    }

    // Generate storage path
    const fileName = `${await cryptoRandom()}.jpg`;
    const path = `${communityId}/${fileName}`;

    logger.log('[communities] Uploading to avatars bucket:', path);

    // Upload to avatars bucket (reuse existing bucket)
    const arrayBuffer = base64ToUint8Array(base64);
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      logger.error('[communities] Upload error:', uploadError);
      Alert.alert('Fejl', 'Upload fejlede. Prøv igen.');
      return false;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(path);

    // Update community record
    const { error: updateError } = await supabase
      .from('communities')
      .update({
        avatar_path: path,
        avatar_url: publicUrl,
        avatar_kind: kind,
      })
      .eq('id', communityId);

    if (updateError) {
      logger.error('[communities] Update error:', updateError);
      Alert.alert('Fejl', 'Kunne ikke opdatere community. Prøv igen.');
      return false;
    }

    logger.log('[communities] Successfully uploaded avatar:', { communityId, path, kind });
    return true;
  } catch (err) {
    logger.error('[communities] Unexpected error:', err);
    Alert.alert('Fejl', 'Noget gik galt. Prøv igen.');
    return false;
  }
}

/**
 * Upload community cover (hero) image.
 * Stores path in communities.cover_path.
 */
export async function uploadCommunityCover(
  communityId: string,
  fileUri: string,
): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn('[communities] User not authenticated');
      return null;
    }

    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists || fileInfo.size === 0) {
      Alert.alert('Fejl', 'Filen kunne ikke findes eller er tom');
      return null;
    }

    const manipResult = await ImageManipulator.manipulateAsync(
      fileUri,
      [{ resize: { width: COMMUNITY_COVER_MAX_WIDTH } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    const base64 = manipResult.base64;
    if (!base64) {
      Alert.alert('Fejl', 'Kunne ikke konvertere billedet');
      return null;
    }

    const bytes = base64ToUint8Array(base64);
    if (bytes.length === 0) {
      Alert.alert('Fejl', 'Konverteret billede er tomt (0 bytes)');
      return null;
    }

    const fileName = `${Date.now()}-${await cryptoRandom()}.jpg`;
    const path = `communities/${communityId}/cover/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(COMMUNITY_MEDIA_BUCKET)
      .upload(path, bytes, {
        contentType: 'image/jpeg',
        upsert: false,
        cacheControl: '3600',
      });

    if (uploadError) {
      logger.error('[communities] Cover upload error:', uploadError);
      Alert.alert(
        'Upload fejlede',
        "Upload fejlede. Tjek at bucket 'community-media' findes og at storage policies tillader authenticated uploads.",
      );
      return null;
    }

    const { error: updateError } = await supabase
      .from('communities')
      .update({ cover_path: path })
      .eq('id', communityId);

    if (updateError) {
      logger.error('[communities] Cover update error:', updateError);
      Alert.alert('Fejl', 'Kunne ikke opdatere community. Prøv igen.');
      return null;
    }

    logger.log('[communities] Successfully uploaded cover:', { communityId, path });
    return path;
  } catch (err) {
    logger.error('[communities] Unexpected cover upload error:', err);
    Alert.alert('Fejl', 'Noget gik galt. Prøv igen.');
    return null;
  }
}

/**
 * Update community name, description, and/or location
 */
export async function updateCommunity(
  communityId: string,
  updates: {
    name?: string;
    description?: string | null;
    location_label?: string | null;
    lat?: number | null;
    lng?: number | null;
    place_name?: string | null;
    geocoded_at?: string | null;
    cover_path?: string | null;
    avatar_path?: string | null;
    avatar_url?: string | null;
    avatar_kind?: 'logo' | 'image' | null;
    mobilepay_info?: string | null;
    mobilepay_instructions?: string | null;
  },
): Promise<boolean> {
  try {
    const updateBody = {
      ...(updates.name !== undefined && { name: updates.name.trim() }),
      ...(updates.description !== undefined && {
        description: updates.description?.trim() || null,
      }),
      ...(updates.location_label !== undefined && {
        location_label: updates.location_label?.trim() || null,
      }),
      ...(updates.lat !== undefined && { lat: updates.lat }),
      ...(updates.lng !== undefined && { lng: updates.lng }),
      ...(updates.place_name !== undefined && { place_name: updates.place_name }),
      ...(updates.geocoded_at !== undefined && { geocoded_at: updates.geocoded_at }),
      ...(updates.cover_path !== undefined && { cover_path: updates.cover_path }),
      ...(updates.avatar_path !== undefined && { avatar_path: updates.avatar_path }),
      ...(updates.avatar_url !== undefined && { avatar_url: updates.avatar_url }),
      ...(updates.avatar_kind !== undefined && { avatar_kind: updates.avatar_kind }),
      ...(updates.mobilepay_info !== undefined && {
        mobilepay_info: updates.mobilepay_info?.trim() || null,
      }),
      ...(updates.mobilepay_instructions !== undefined && {
        mobilepay_instructions: updates.mobilepay_instructions?.trim() || null,
      }),
    };

    logger.log('[communities] updateCommunity payload:', {
      communityId,
      updates: updateBody,
    });

    const { error } = await supabase
      .from('communities')
      .update(updateBody)
      .eq('id', communityId);

    if (error) {
      logger.error('[communities] Error updating community:', {
        code: error.code,
        message: error.message,
        details: error,
      });
      return false;
    }

    logger.log('[communities] Successfully updated community:', communityId);
    return true;
  } catch (err) {
    logger.error('[communities] Unexpected error updating community:', {
      error: err,
      communityId,
    });
    return false;
  }
}

/**
 * Update member role (owner-only)
 * Alias for setMemberRole with the same signature
 */
export async function updateMemberRole(
  communityId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<boolean> {
  return setMemberRole(communityId, userId, role);
}
/**
 * Delete community as app admin (SECURITY DEFINER via RPC)
 * Cascading deletes handle members, requests, posts, etc.
 */
export async function deleteCommunityAsAdmin(communityId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('delete_community_as_admin', {
      p_community_id: communityId,
    });

    if (error) {
      logger.error('[communities] Error deleting community:', error);
      return false;
    }

    logger.log('[communities] Successfully deleted community:', communityId);
    return true;
  } catch (err) {
    logger.error('[communities] Unexpected error deleting community:', err);
    return false;
  }
}
