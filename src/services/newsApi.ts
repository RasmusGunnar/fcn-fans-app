import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { NewsItem, LinkPreview } from '../types/news';
import { fixEncoding } from '../utils/fixEncoding';
import { sanitizeNewsHeroImageUrl } from '../utils/newsMedia';

const LINK_PREVIEW_TIMEOUT_MS = 8000;

function isInstagramUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return hostname.includes('instagram.com') || hostname === 'instagr.am';
  } catch {
    return false;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function readFunctionErrorDetails(error: any): Promise<{
  status?: number;
  body?: string;
}> {
  const response = error?.context;
  if (!response) {
    return {};
  }

  const status = typeof response.status === 'number' ? response.status : undefined;

  try {
    const body = await response.text();
    return {
      status,
      body: typeof body === 'string' && body.trim().length > 0 ? body : undefined,
    };
  } catch {
    return { status };
  }
}

/**
 * Fetch link preview using Supabase Edge Function
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    logger.log('[newsApi] fetchLinkPreview called with URL:', url);

    const { data, error } = await withTimeout(
      supabase.functions.invoke('parse-link', {
        body: { url },
      }),
      LINK_PREVIEW_TIMEOUT_MS,
      'Link preview timeout',
    );

    if (error) {
      const details = await readFunctionErrorDetails(error);
      logger.error('[newsApi] Edge function error:', {
        name: error?.name,
        message: error?.message,
        status: details.status,
        body: details.body,
      });

      const detailMessage =
        details.body ||
        (details.status ? `Preview fetch fejlede (${details.status})` : undefined) ||
        error.message ||
        'Kunne ikke hente link preview';

      throw new Error(detailMessage);
    }

    if (!data) {
      throw new Error('Ingen data returneret fra parse-link');
    }

    logger.log('[newsApi] Link preview fetched:', data);

    const resolvedUrl = data.resolvedUrl || url;
    const isInstagramPreview = isInstagramUrl(resolvedUrl);
    const normalizedImageUrl = isInstagramPreview
      ? undefined
      : sanitizeNewsHeroImageUrl(data.imageUrl, resolvedUrl) || undefined;

    return {
      url: resolvedUrl,
      title: fixEncoding(data.title) || 'Ingen titel',
      description: fixEncoding(data.description) || undefined,
      imageUrl: normalizedImageUrl,
      siteName: fixEncoding(data.siteName) || new URL(url).hostname,
      hasVideo: isInstagramPreview ? false : Boolean(data.hasVideo),
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
  createdBy: string;
  actorType: 'user' | 'community';
  actorId: string;
  communityId?: string;
}): Promise<NewsItem> {
  try {
    logger.log('[newsApi] insertNewsItem called:', params);

    const isInstagramNews = isInstagramUrl(params.url);
    const insertPayload = {
      url: params.url,
      title: fixEncoding(params.title),
      description: fixEncoding(params.description),
      image_url: isInstagramNews ? null : sanitizeNewsHeroImageUrl(params.imageUrl, params.url),
      site_name: fixEncoding(params.siteName),
      created_by: params.createdBy,
      actor_type: params.actorType,
      actor_id: params.actorId,
      community_id: params.communityId,
      note: fixEncoding(params.note),
    };

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

      const isDuplicateUrl =
        error.code === '23505' ||
        error.message?.toLowerCase().includes('duplicate key') ||
        error.message?.toLowerCase().includes('unique constraint') ||
        error.details?.toLowerCase().includes('news_items_url_key') ||
        error.hint?.toLowerCase().includes('duplicate');

      if (isDuplicateUrl) {
        const duplicateError = new Error(
          'Det link er allerede delt i appen. Et link kan kun oprettes én gang.',
        ) as Error & { kind?: string; originalCode?: string };
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

    return {
      id: data.id,
      url: data.url,
      title: fixEncoding(data.title) ?? undefined,
      description: fixEncoding(data.description) ?? undefined,
      note: fixEncoding(data.note) ?? undefined,
      imageUrl: sanitizeNewsHeroImageUrl(data.image_url, data.url) || undefined,
      siteName: fixEncoding(data.site_name) ?? undefined,
      createdBy: data.created_by,
      actorType: data.actor_type,
      actorId: data.actor_id,
      actorName: 'Ukendt',
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

    return (data || []).map((item) => ({
      id: item.id,
      url: item.url,
      title: fixEncoding(item.title) ?? undefined,
      description: fixEncoding(item.description) ?? undefined,
      note: fixEncoding(item.note) ?? undefined,
      imageUrl: sanitizeNewsHeroImageUrl(item.image_url, item.url) || undefined,
      siteName: fixEncoding(item.site_name) ?? undefined,
      createdBy: item.created_by,
      actorType: item.actor_type,
      actorId: item.actor_id,
      actorName: 'Ukendt',
      communityId: item.community_id,
      createdAt: item.created_at,
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
    }));
  } catch (error: any) {
    logger.warn(
      '[newsApi] fetchNewsItems failed (returning empty array):',
      error?.message || error,
    );
    return [];
  }
}
