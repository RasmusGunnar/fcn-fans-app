import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { NewsItem, LinkPreview } from '../types/news';

/**
 * Fetch link preview using Supabase Edge Function
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    logger.log('[newsApi] fetchLinkPreview called with URL:', url);

    const { data, error } = await supabase.functions.invoke('parse-link', {
      body: { url },
    });

    if (error) {
      logger.error('[newsApi] Edge function error:', error);
      throw new Error(error.message || 'Kunne ikke hente link preview');
    }

    if (!data) {
      throw new Error('Ingen data returneret fra parse-link');
    }

    logger.log('[newsApi] Link preview fetched:', data);

    // Transform edge function response to LinkPreview
    return {
      url: data.resolvedUrl || url,
      title: data.title || 'Ingen titel',
      description: data.description || undefined,
      imageUrl: data.imageUrl || undefined,
      siteName: data.siteName || new URL(url).hostname,
    };
  } catch (error: any) {
    logger.error('[newsApi] fetchLinkPreview error:', error);
    throw new Error(error?.message || 'Kunne ikke hente link preview');
  }
}

/**
 * Insert a new news item
 */
export async function insertNewsItem(params: {
  url: string;
  title?: string;
  description?: string;
  note?: string;
  imageUrl?: string;
  siteName?: string;
  createdBy: string; // Add created_by to params
  actorType: 'user' | 'community';
  actorId: string;
  communityId?: string;
}): Promise<NewsItem> {
  try {
    logger.log('[newsApi] insertNewsItem called:', params);

    // Log payload right before insert for RLS debugging
    const insertPayload = {
      url: params.url,
      title: params.title,
      description: params.description,
      image_url: params.imageUrl,
      site_name: params.siteName,
      created_by: params.createdBy,
      actor_type: params.actorType,
      actor_id: params.actorId,
      community_id: params.communityId,
      note: params.note,
    };

    // REAL JSON log of complete payload
    logger.log('[newsApi] insertPayload', insertPayload);

    const { data, error } = await supabase
      .from('news_items')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      logger.error('[newsApi] insertNewsItem Supabase error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      // Detect duplicate URL constraint violation
      const isDuplicateUrl =
        error.code === '23505' || // Postgres unique violation
        error.message?.toLowerCase().includes('duplicate key') ||
        error.message?.toLowerCase().includes('unique constraint') ||
        error.details?.toLowerCase().includes('news_items_url_key') ||
        error.hint?.toLowerCase().includes('duplicate');

      if (isDuplicateUrl) {
        const duplicateError = new Error(
          'Det link er allerede delt i appen. Et link kan kun oprettes én gang.',
        ) as any;
        duplicateError.kind = 'DUPLICATE_URL';
        duplicateError.originalCode = error.code;
        throw duplicateError;
      }

      throw error;
    }

    if (!data) {
      throw new Error('Ingen data returneret efter insert');
    }

    logger.log('[newsApi] News item inserted successfully:', data.id);

    // Transform DB response to NewsItem
    return {
      id: data.id,
      url: data.url,
      title: data.title,
      description: data.description,
      note: data.note,
      imageUrl: data.image_url,
      siteName: data.site_name,
      createdBy: data.created_by,
      actorType: data.actor_type,
      actorId: data.actor_id,
      actorName: 'Ukendt', // Will be populated by feed context
      communityId: data.community_id,
      createdAt: data.created_at,
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
    };
  } catch (error: any) {
    logger.error('[newsApi] insertNewsItem failed:', error?.message || error);
    throw error;
  }
}

/**
 * Fetch news items from database
 */
export async function fetchNewsItems(limit: number = 50): Promise<NewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      // Handle PGRST205: table not found - this is expected before migration
      if (
        error.code === 'PGRST204' ||
        error.code === '42P01' ||
        error.message.includes('does not exist') ||
        error.message.includes('not found')
      ) {
        logger.warn(
          '[newsApi] news_items table not found (migration not run yet). Returning empty array.',
        );
        return [];
      }
      logger.error('[newsApi] fetchNewsItems error:', error);
      throw error;
    }

    // Transform DB results to NewsItem[]
    return (data || []).map((item) => ({
      id: item.id,
      url: item.url,
      title: item.title,
      description: item.description,
      note: item.note,
      imageUrl: item.image_url,
      siteName: item.site_name,
      createdBy: item.created_by,
      actorType: item.actor_type,
      actorId: item.actor_id,
      actorName: 'Ukendt', // TODO: Join with profiles/communities for names
      communityId: item.community_id,
      createdAt: item.created_at,
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
    }));
  } catch (error: any) {
    // Catch any unexpected errors and log as warning, return empty array
    logger.warn(
      '[newsApi] fetchNewsItems failed (returning empty array):',
      error?.message || error,
    );
    return [];
  }
}
