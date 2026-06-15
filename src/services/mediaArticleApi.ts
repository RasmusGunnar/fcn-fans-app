import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import type { LinkPreview } from '../types/news';
import { normalizePostType, type Post } from '../types/post';
import { normalizeLinkPreview } from '../utils/linkPreview';
import {
  buildMediaArticleInsertPayload,
  normalizeMediaArticleUrl,
  type MediaArticleInsertPayload,
} from '../utils/mediaArticle';
import {
  buildMediaArticleAdminItems,
  type MediaArticleAdminItem,
  type MediaArticleAdminRow,
} from '../utils/mediaArticleAdmin';
import { describeMediaArticleApprovalError } from '../utils/mediaArticleApprovalError';
import {
  buildMediaArticleCandidateItems,
  type MediaArticleCandidateItem,
  type MediaArticleCandidateRow,
  type MediaArticleCandidateStatus,
} from '../utils/mediaArticleCandidates';
import { normalizeMedia } from '../utils/media';

export type MediaArticleApiErrorKind = 'ADMIN_REQUIRED' | 'DUPLICATE_URL';

export class MediaArticleApiError extends Error {
  constructor(
    message: string,
    readonly kind: MediaArticleApiErrorKind,
  ) {
    super(message);
    this.name = 'MediaArticleApiError';
  }
}

type MediaArticleRow = {
  id: string;
  created_at: string | null;
  author_id: string;
  actor_type: string | null;
  actor_id: string | null;
  text: string | null;
  media: unknown;
  community_id: string | null;
  feed_targets: unknown;
  link_preview: unknown;
  post_type: unknown;
};

export type MediaArticleIngestionSourceDiagnostic = {
  sourceKey: string;
  sourceName: string;
  endpointsAttempted: number;
  endpointsFetched: number;
  found: number;
  matched: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  errors: string[];
  decisions: {
    url: string;
    decision: 'accepted' | 'rejected' | 'duplicate' | 'error';
    reason: string;
    score?: number;
  }[];
};

export type MediaArticleIngestionResult = {
  found: number;
  matched: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  errors: number;
  runtimeMs: number;
  sources: MediaArticleIngestionSourceDiagnostic[];
};

async function assertCurrentUserIsAppAdmin(): Promise<void> {
  const { data, error } = await supabase.rpc('is_app_admin');

  if (error) {
    logger.error('[mediaArticleApi] Admin check failed:', error);
    throw error;
  }

  if (!data) {
    throw new MediaArticleApiError(
      'Kun app-administratorer kan administrere medieartikler.',
      'ADMIN_REQUIRED',
    );
  }
}

function cleanOptionalText(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

async function assertUrlIsNotAlreadyImported(url: string): Promise<void> {
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('post_type', 'media_article')
    .eq('link_preview->>url', url)
    .limit(1);

  if (error) {
    logger.error('[mediaArticleApi] Duplicate lookup failed:', error);
    throw error;
  }

  if (data && data.length > 0) {
    throw new MediaArticleApiError('Artiklen er allerede importeret.', 'DUPLICATE_URL');
  }
}

function mapCreatedMediaArticle(row: MediaArticleRow): Post {
  const feedTargets = Array.isArray(row.feed_targets)
    ? row.feed_targets.filter((target): target is string => typeof target === 'string')
    : ['home'];

  return {
    id: row.id,
    postType: normalizePostType(row.post_type),
    authorName: 'Fan',
    authorId: row.author_id,
    actorType: row.actor_type === 'community' ? 'community' : 'user',
    actorId: row.actor_id ?? row.author_id,
    communityId: row.community_id,
    feedTargets: feedTargets.length > 0 ? feedTargets : ['home'],
    createdAt: row.created_at ?? new Date().toISOString(),
    text: row.text ?? '',
    linkPreview: normalizeLinkPreview(row.link_preview),
    media: normalizeMedia(row.media),
    likesCount: 0,
    commentsCount: 0,
    likedByMe: false,
  };
}

export async function createMediaArticlePost(input: {
  authorId: string;
  url: string;
  caption?: string | null;
  preview?: Parameters<typeof buildMediaArticleInsertPayload>[0]['preview'];
}): Promise<Post> {
  await assertCurrentUserIsAppAdmin();

  const payload: MediaArticleInsertPayload = buildMediaArticleInsertPayload(input);
  await assertUrlIsNotAlreadyImported(payload.link_preview.url);

  const { data, error } = await supabase
    .from('posts')
    .insert(payload)
    .select(
      'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets, link_preview, post_type',
    )
    .single();

  if (error) {
    logger.error('[mediaArticleApi] Insert failed:', error);
    throw error;
  }

  return mapCreatedMediaArticle(data as MediaArticleRow);
}

export async function listMediaArticlePosts(): Promise<MediaArticleAdminItem[]> {
  await assertCurrentUserIsAppAdmin();

  const { data, error } = await supabase
    .from('posts')
    .select('id, created_at, text, link_preview, post_type')
    .eq('post_type', 'media_article')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[mediaArticleApi] Admin list failed:', error);
    throw error;
  }

  return buildMediaArticleAdminItems((data ?? []) as MediaArticleAdminRow[]);
}

export async function listMediaArticleCandidates(): Promise<MediaArticleCandidateItem[]> {
  await assertCurrentUserIsAppAdmin();

  const { data, error } = await supabase
    .from('media_article_candidates')
    .select(
      'id, source_key, source_name, source_url, canonical_url, title, description, image_url, caption, published_at, detected_keywords, relevance_score, status, reviewed_at, published_post_id, created_at, updated_at',
    )
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[mediaArticleApi] Candidate list failed:', error);
    throw error;
  }

  return buildMediaArticleCandidateItems((data ?? []) as MediaArticleCandidateRow[]);
}

export async function runMediaArticleCandidateIngestion(
  sourceKeys?: string[],
): Promise<MediaArticleIngestionResult> {
  await assertCurrentUserIsAppAdmin();

  const { data, error } = await supabase.functions.invoke('ingest-media-article-candidates', {
    body: sourceKeys?.length ? { sourceKeys } : {},
  });

  if (error) {
    logger.error('[mediaArticleApi] Candidate ingestion failed:', error);
    throw error;
  }

  return data as MediaArticleIngestionResult;
}

export async function updateMediaArticleCandidate(input: {
  id: string;
  sourceName: string;
  canonicalUrl: string;
  title: string;
  description: string;
  imageUrl: string;
  caption: string;
  status?: Exclude<MediaArticleCandidateStatus, 'approved'>;
}): Promise<MediaArticleCandidateItem> {
  await assertCurrentUserIsAppAdmin();

  const canonicalUrl = normalizeMediaArticleUrl(input.canonicalUrl);
  if (!canonicalUrl) {
    throw new TypeError('Kandidaten kræver en gyldig artikel-URL.');
  }

  const sourceName = input.sourceName.trim();
  const title = input.title.trim();
  if (!sourceName || !title) {
    throw new TypeError('Kandidaten kræver kilde og titel.');
  }

  const update: Record<string, string | null> = {
    source_name: sourceName,
    canonical_url: canonicalUrl,
    title,
    description: cleanOptionalText(input.description) ?? null,
    image_url: normalizeMediaArticleUrl(input.imageUrl) ?? null,
    caption: input.caption.trim(),
  };

  if (input.status) {
    update.status = input.status;
  }

  const { data, error } = await supabase
    .from('media_article_candidates')
    .update(update)
    .eq('id', input.id)
    .select(
      'id, source_key, source_name, source_url, canonical_url, title, description, image_url, caption, published_at, detected_keywords, relevance_score, status, reviewed_at, published_post_id, created_at, updated_at',
    )
    .single();

  if (error) {
    logger.error('[mediaArticleApi] Candidate update failed:', error);
    if (error.code === '23505') {
      throw new MediaArticleApiError('Artiklen findes allerede i gennemgangen.', 'DUPLICATE_URL');
    }
    throw error;
  }

  const candidate = buildMediaArticleCandidateItems([data as MediaArticleCandidateRow])[0];
  if (!candidate) {
    throw new Error('Candidate update returned an invalid row');
  }

  return candidate;
}

export async function approveMediaArticleCandidate(candidateId: string): Promise<string> {
  await assertCurrentUserIsAppAdmin();

  const { data, error } = await supabase.rpc('approve_media_article_candidate', {
    p_candidate_id: candidateId,
  });

  if (error) {
    const diagnostic = describeMediaArticleApprovalError(error);
    logger.error('[mediaArticleApi][CandidateApproval][RPC]', {
      candidateId,
      ...diagnostic,
      rawError: error,
    });
    throw error;
  }

  if (typeof data !== 'string' || !data) {
    logger.error('[mediaArticleApi][CandidateApproval][RPC_RESPONSE]', {
      candidateId,
      data,
      expected: 'non-empty post UUID string',
    });
    throw new Error('Candidate approval did not return a post ID');
  }

  return data;
}

export async function updateMediaArticlePost(input: {
  id: string;
  caption: string;
  title: string;
  description: string;
  linkPreview: LinkPreview;
}): Promise<MediaArticleAdminItem> {
  await assertCurrentUserIsAppAdmin();

  const linkPreview = normalizeLinkPreview({
    ...input.linkPreview,
    title: cleanOptionalText(input.title),
    description: cleanOptionalText(input.description),
  });

  if (!linkPreview) {
    throw new TypeError('media_article requires a valid link preview');
  }

  const { data, error } = await supabase
    .from('posts')
    .update({
      text: input.caption.trim(),
      link_preview: linkPreview,
    })
    .eq('id', input.id)
    .eq('post_type', 'media_article')
    .select('id, created_at, text, link_preview, post_type')
    .single();

  if (error) {
    logger.error('[mediaArticleApi] Admin update failed:', error);
    throw error;
  }

  const updated = buildMediaArticleAdminItems([data as MediaArticleAdminRow])[0];
  if (!updated) {
    throw new Error('Media article update returned an invalid row');
  }

  return updated;
}

export async function deleteMediaArticlePost(postId: string): Promise<void> {
  await assertCurrentUserIsAppAdmin();

  const { data, error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('post_type', 'media_article')
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('[mediaArticleApi] Admin delete failed:', error);
    throw error;
  }

  if (!data) {
    throw new Error('Media article was not deleted');
  }
}
