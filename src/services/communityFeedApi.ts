import { logger } from '../lib/logger';
import { getPublicUrl } from '../lib/storageUrl';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl } from '../utils/avatar';
import { COMMUNITY_MEDIA_BUCKET, type Community } from './communities';
import { HOME_FEED_AUDIT_DEBUG_ENABLED } from '../utils/homeFeed';

type CommunityFeedRow = {
  id?: string;
  community_id: string;
  created_at: string;
  created_by: string | null;
};

type CommunityFeedCommunity = Pick<
  Community,
  'id' | 'name' | 'description' | 'avatar_url' | 'avatar_path' | 'cover_path' | 'visibility' | 'type'
>;
type CommunityFeedCommunityLike = Pick<
  Community,
  | 'id'
  | 'name'
  | 'description'
  | 'created_at'
  | 'created_by'
  | 'avatar_url'
  | 'avatar_path'
  | 'cover_path'
  | 'visibility'
  | 'type'
>;

export type CommunityFeedSource = {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  debug_source?: 'local' | 'persisted' | 'local+persisted' | null;
};

function resolveCommunityFeedCreatedAt(
  feedCreatedAt?: string | null,
  communityCreatedAt?: string | null,
): string {
  if (typeof feedCreatedAt === 'string' && feedCreatedAt.trim().length > 0) {
    return feedCreatedAt;
  }

  if (typeof communityCreatedAt === 'string' && communityCreatedAt.trim().length > 0) {
    return communityCreatedAt;
  }

  return new Date().toISOString();
}

export function buildCommunityFeedSourceFromCommunity(
  community: CommunityFeedCommunityLike,
  createdAt = community.created_at,
  debugSource: CommunityFeedSource['debug_source'] = 'local',
): CommunityFeedSource | null {
  return toCommunityFeedSource(
    {
      community_id: community.id,
      created_at: resolveCommunityFeedCreatedAt(createdAt, community.created_at),
      created_by: community.created_by ?? null,
    },
    community,
    debugSource,
  );
}

function toCommunityFeedSource(
  row: Pick<CommunityFeedRow, 'community_id' | 'created_at' | 'created_by'>,
  community: CommunityFeedCommunity | null,
  debugSource: CommunityFeedSource['debug_source'] = 'persisted',
): CommunityFeedSource | null {
  if (!community || community.type !== 'community') {
    return null;
  }

  if (community.visibility && community.visibility !== 'public') {
    return null;
  }

  return {
    id: row.community_id,
    community_id: row.community_id,
    name: community.name,
    description: community.description ?? null,
    created_at: resolveCommunityFeedCreatedAt(row.created_at, null),
    created_by: row.created_by ?? null,
    avatar_url: resolveAvatarUrl(community.avatar_url ?? community.avatar_path ?? null),
    cover_url: getPublicUrl(COMMUNITY_MEDIA_BUCKET, community.cover_path ?? null),
    debug_source: debugSource,
  };
}

async function fetchPersistedCommunityFeedItem(
  communityId: string,
  fallbackCommunity?: CommunityFeedCommunityLike | null,
): Promise<CommunityFeedSource | null> {
  const { data: row, error: rowError } = await supabase
    .from('community_feed_items')
    .select('community_id, created_at, created_by')
    .eq('community_id', communityId)
    .maybeSingle();

  if (rowError) {
    throw rowError;
  }

  if (!row) {
    return fallbackCommunity
      ? buildCommunityFeedSourceFromCommunity(
          fallbackCommunity,
          fallbackCommunity.created_at,
          'persisted',
        )
      : null;
  }

  const { data: communityRow, error: communityError } = await supabase
    .from('communities')
    .select(
      'id, name, description, created_at, created_by, avatar_url, avatar_path, cover_path, visibility, type',
    )
    .eq('id', communityId)
    .maybeSingle();

  if (communityError) {
    throw communityError;
  }

  return toCommunityFeedSource(
    {
      community_id: row.community_id,
      created_at: resolveCommunityFeedCreatedAt(row.created_at, communityRow?.created_at ?? null),
      created_by: row.created_by ?? communityRow?.created_by ?? fallbackCommunity?.created_by ?? null,
    },
    (communityRow as CommunityFeedCommunity | null) ?? fallbackCommunity ?? null,
    'persisted',
  );
}

export async function fetchHomeCommunityFeedItems(limit = 6): Promise<CommunityFeedSource[]> {
  try {
    const { data, error } = await supabase
      .from('community_feed_items')
      .select('community_id, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (
        error.code === 'PGRST204' ||
        error.code === '42P01' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('not found')
      ) {
        logger.warn(
          '[communityFeedApi] community_feed_items table not found. Returning empty array.',
        );
        return [];
      }

      throw error;
    }

    const feedRows = (data || []) as Pick<CommunityFeedRow, 'community_id' | 'created_at' | 'created_by'>[];
    if (feedRows.length === 0) {
      if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
        logger.log('[communityFeedApi][audit] no persisted community feed rows found');
      }
      return [];
    }

    const communityIds = [...new Set(feedRows.map((row) => row.community_id).filter(Boolean))];
    const { data: communities, error: communitiesError } = await supabase
      .from('communities')
      .select('id, name, description, avatar_url, avatar_path, cover_path, visibility, type')
      .in('id', communityIds);

    if (communitiesError) {
      throw communitiesError;
    }

    const communityMap = new Map<string, CommunityFeedCommunity>();
    (communities || []).forEach((community) => {
      communityMap.set(community.id, community as CommunityFeedCommunity);
    });

    const communityFeedSources = feedRows
      .map((row) =>
        toCommunityFeedSource(row, communityMap.get(row.community_id) ?? null, 'persisted'),
      )
      .filter(Boolean) as CommunityFeedSource[];

    if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
      logger.log('[communityFeedApi][audit] fetched persisted community feed rows', {
        requestedLimit: limit,
        rowCount: feedRows.length,
        resolvedCount: communityFeedSources.length,
        communityIds: communityFeedSources.map((entry) => entry.community_id),
      });
    }

    return communityFeedSources;
  } catch (error) {
    if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
      logger.warn('[communityFeedApi][audit] fetchHomeCommunityFeedItems failed', {
        error,
      });
    }
    logger.warn('[communityFeedApi] fetchHomeCommunityFeedItems failed:', error);
    return [];
  }
}

export async function createCommunityFeedItem(
  community: CommunityFeedCommunityLike,
): Promise<CommunityFeedSource | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const createdBy = community.created_by ?? user?.id ?? null;

    if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
      logger.log('[communityFeedApi][audit] creating persisted community feed item', {
        communityId: community.id,
        createdBy,
        visibility: community.visibility ?? null,
        type: community.type ?? null,
      });
    }

    const { data, error } = await supabase
      .from('community_feed_items')
      .insert({
        community_id: community.id,
        created_by: createdBy,
      })
      .select('community_id, created_at, created_by')
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: existingRow, error: existingError } = await supabase
          .from('community_feed_items')
          .select('community_id, created_at, created_by')
          .eq('community_id', community.id)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        if (!existingRow) {
          return buildCommunityFeedSourceFromCommunity(
            {
              ...community,
              created_by: createdBy,
            },
            community.created_at,
            'persisted',
          );
        }

        return fetchPersistedCommunityFeedItem(community.id, {
          ...community,
          created_by: existingRow.created_by ?? createdBy,
          created_at: resolveCommunityFeedCreatedAt(existingRow.created_at, community.created_at),
        });
      }

      if (
        error.code === 'PGRST116' ||
        error.message?.includes('JSON object requested, multiple (or no) rows returned')
      ) {
        return fetchPersistedCommunityFeedItem(community.id, {
          ...community,
          created_by: createdBy,
        });
      }

      throw error;
    }

    const persistedCommunityFeedItem =
      (await fetchPersistedCommunityFeedItem(community.id, {
        ...community,
        created_by: data.created_by ?? createdBy,
        created_at: resolveCommunityFeedCreatedAt(data.created_at, community.created_at),
      })) ??
      buildCommunityFeedSourceFromCommunity(
        {
          ...community,
          created_by: data.created_by ?? createdBy,
        },
        resolveCommunityFeedCreatedAt(data.created_at, community.created_at),
        'persisted',
      );

    if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
      logger.log('[communityFeedApi][audit] persisted community feed item created', {
        communityId: community.id,
        createdAt: persistedCommunityFeedItem?.created_at ?? null,
      });
    }

    return persistedCommunityFeedItem;
  } catch (error) {
    if (HOME_FEED_AUDIT_DEBUG_ENABLED) {
      logger.warn('[communityFeedApi][audit] createCommunityFeedItem failed', {
        communityId: community.id,
        error,
      });
    }
    logger.warn('[communityFeedApi] createCommunityFeedItem failed:', error);
    return null;
  }
}
