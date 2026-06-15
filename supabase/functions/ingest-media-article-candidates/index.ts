import { createClient } from 'npm:@supabase/supabase-js@2';
import { XMLParser } from 'npm:fast-xml-parser@4';
import {
  dedupeCandidateDiscoveries,
  extractCanonicalUrl,
  extractHtmlListingCandidates,
  isPaywalledDocument,
  normalizeCandidateUrl,
  scoreMediaArticleCandidate,
  type SourceDocumentItem,
} from '../_shared/mediaArticleCandidateCore.ts';
import {
  MEDIA_ARTICLE_SOURCES,
  type MediaArticleSourceAdapter,
  type MediaArticleSourceEndpoint,
} from '../_shared/mediaArticleSources.ts';
import {
  extractArticleMetadata,
  fetchArticleMedia,
  sanitizeNewsHeroImageUrl,
} from '../_shared/newsMedia.ts';
import { decodeHtml } from '../_shared/decodeHtml.ts';
import { decodeResponseText, fixEncoding } from '../_shared/textEncoding.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const USER_AGENT = 'fcn-fans-media-candidate-ingest/1.0';
const LISTING_TIMEOUT_MS = 8000;
const ARTICLE_TIMEOUT_MS = 6000;
const MAX_DETAIL_FETCHES_PER_SOURCE = 20;
const MAX_DECISIONS_PER_SOURCE = 60;
const SOURCE_CONCURRENCY = 3;
const ARTICLE_CONCURRENCY = 3;

type CandidateInsert = {
  source_key: string;
  source_name: string;
  source_url: string;
  canonical_url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  published_at: string | null;
  detected_keywords: string[];
  relevance_score: number;
  status: 'pending';
};

type SourceDecision = {
  url: string;
  decision: 'accepted' | 'rejected' | 'duplicate' | 'error';
  reason: string;
  score?: number;
};

type SourceDiagnostic = {
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
  decisions: SourceDecision[];
};

type ExistingUrlSets = {
  candidates: Set<string>;
  posts: Set<string>;
};

type FetchResult = {
  body: string;
  contentType: string;
  resolvedUrl: string;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authorization = req.headers.get('authorization') ?? '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Missing Supabase environment' }, 500);
  }

  if (!authorization) {
    return jsonResponse({ error: 'Authentication required' }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Authentication required' }, 401);
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_app_admin');
  if (adminError || !isAdmin) {
    return jsonResponse({ error: 'App admin required' }, 403);
  }

  const requestedKeys = await readRequestedSourceKeys(req);
  const sources = requestedKeys
    ? MEDIA_ARTICLE_SOURCES.filter((source) => requestedKeys.has(source.key))
    : [...MEDIA_ARTICLE_SOURCES];

  if (sources.length === 0) {
    return jsonResponse({ error: 'No configured sources selected' }, 400);
  }

  const startedAt = Date.now();

  try {
    const existingUrls = await loadExistingUrls(supabase);
    const diagnostics = await mapWithConcurrency(sources, SOURCE_CONCURRENCY, (source) =>
      ingestSource(source, supabase, existingUrls),
    );

    const totals = diagnostics.reduce(
      (result, source) => ({
        found: result.found + source.found,
        matched: result.matched + source.matched,
        inserted: result.inserted + source.inserted,
        duplicates: result.duplicates + source.duplicates,
        rejected: result.rejected + source.rejected,
        errors: result.errors + source.errors.length,
      }),
      { found: 0, matched: 0, inserted: 0, duplicates: 0, rejected: 0, errors: 0 },
    );

    console.log(
      `[media-candidates] complete sources=${sources.length} found=${totals.found} matched=${totals.matched} inserted=${totals.inserted} duplicates=${totals.duplicates} rejected=${totals.rejected} runtime_ms=${Date.now() - startedAt}`,
    );

    return jsonResponse({
      ...totals,
      runtimeMs: Date.now() - startedAt,
      sources: diagnostics,
    });
  } catch (error) {
    console.error('[media-candidates] ingestion failed', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Candidate ingestion failed' },
      500,
    );
  }
});

async function ingestSource(
  source: MediaArticleSourceAdapter,
  supabase: ReturnType<typeof createClient>,
  existingUrls: ExistingUrlSets,
): Promise<SourceDiagnostic> {
  const diagnostic: SourceDiagnostic = {
    sourceKey: source.key,
    sourceName: source.sourceName,
    endpointsAttempted: source.endpoints.length,
    endpointsFetched: 0,
    found: 0,
    matched: 0,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    errors: [],
    decisions: [],
  };
  const discovered: SourceDocumentItem[] = [];

  for (const endpoint of source.endpoints) {
    try {
      const response = await fetchDocument(endpoint.url, LISTING_TIMEOUT_MS);
      diagnostic.endpointsFetched += 1;
      discovered.push(...extractSourceItems(source, endpoint, response.body, response.contentType));
    } catch (error) {
      const message = `${endpoint.url}: ${toErrorMessage(error)}`;
      diagnostic.errors.push(message);
      addDecision(diagnostic, {
        url: endpoint.url,
        decision: 'error',
        reason: toErrorMessage(error),
      });
    }
  }

  const deduped = dedupeCandidateDiscoveries(discovered);
  diagnostic.found = discovered.length;
  diagnostic.duplicates += deduped.duplicateCount;

  const initiallyMatched = deduped.unique.flatMap((item) => {
    const relevance = scoreMediaArticleCandidate({
      title: item.title,
      description: item.description,
      url: item.sourceUrl,
      tags: item.tags,
      fromClubPage: item.fromClubPage,
    });

    if (!relevance.accepted) {
      diagnostic.rejected += 1;
      addDecision(diagnostic, {
        url: item.sourceUrl,
        decision: 'rejected',
        reason: relevance.reason,
        score: relevance.score,
      });
      return [];
    }

    return [{ item, relevance }];
  });

  const limitedMatches = initiallyMatched.slice(0, MAX_DETAIL_FETCHES_PER_SOURCE);
  diagnostic.matched = initiallyMatched.length;

  const enriched = await mapWithConcurrency(limitedMatches, ARTICLE_CONCURRENCY, async ({ item }) =>
    enrichCandidate(source, item),
  );

  for (const result of enriched) {
    if ('error' in result) {
      diagnostic.rejected += 1;
      addDecision(diagnostic, {
        url: result.url,
        decision: result.paywalled ? 'rejected' : 'error',
        reason: result.error,
      });
      if (!result.paywalled) {
        diagnostic.errors.push(`${result.url}: ${result.error}`);
      }
      continue;
    }

    const candidate = result.candidate;
    if (
      existingUrls.candidates.has(candidate.canonical_url) ||
      existingUrls.candidates.has(candidate.source_url) ||
      existingUrls.posts.has(candidate.canonical_url)
    ) {
      diagnostic.duplicates += 1;
      addDecision(diagnostic, {
        url: candidate.canonical_url,
        decision: 'duplicate',
        reason: existingUrls.posts.has(candidate.canonical_url)
          ? 'Already published as a media_article post'
          : 'Already present in admin review',
        score: candidate.relevance_score,
      });
      continue;
    }

    const { error } = await supabase.from('media_article_candidates').insert(candidate);

    if (error) {
      if (error.code === '23505') {
        diagnostic.duplicates += 1;
        existingUrls.candidates.add(candidate.canonical_url);
        addDecision(diagnostic, {
          url: candidate.canonical_url,
          decision: 'duplicate',
          reason: 'Canonical URL was inserted by another ingestion run',
          score: candidate.relevance_score,
        });
        continue;
      }

      diagnostic.errors.push(`${candidate.canonical_url}: ${error.message}`);
      addDecision(diagnostic, {
        url: candidate.canonical_url,
        decision: 'error',
        reason: error.message,
        score: candidate.relevance_score,
      });
      continue;
    }

    existingUrls.candidates.add(candidate.canonical_url);
    diagnostic.inserted += 1;
    addDecision(diagnostic, {
      url: candidate.canonical_url,
      decision: 'accepted',
      reason: result.reason,
      score: candidate.relevance_score,
    });
  }

  console.log(
    `[media-candidates] source=${source.key} found=${diagnostic.found} matched=${diagnostic.matched} inserted=${diagnostic.inserted} duplicates=${diagnostic.duplicates} rejected=${diagnostic.rejected} errors=${diagnostic.errors.length}`,
  );

  return diagnostic;
}

function extractSourceItems(
  source: MediaArticleSourceAdapter,
  endpoint: MediaArticleSourceEndpoint,
  body: string,
  contentType: string,
): SourceDocumentItem[] {
  const looksLikeFeed =
    endpoint.kind === 'feed' ||
    (endpoint.kind === 'auto' &&
      (/(?:rss|atom|xml)/i.test(contentType) || /^\s*<\?xml|^\s*<(?:rss|feed)\b/i.test(body)));

  if (looksLikeFeed) {
    return extractFeedItems(body, endpoint.fromClubPage);
  }

  return extractHtmlListingCandidates(body, endpoint.url, {
    allowedHosts: source.allowedHosts,
    articlePathPrefixes: endpoint.articlePathPrefixes,
    fromClubPage: endpoint.fromClubPage,
  });
}

function extractFeedItems(xml: string, fromClubPage = false): SourceDocumentItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const rssChannel = asRecord(asRecord(parsed.rss)?.channel);
  if (rssChannel) {
    return ensureArray(rssChannel.item).map((rawItem) => {
      const item = asRecord(rawItem) ?? {};
      const descriptionHtml =
        readNodeText(item.description) || readNodeText(item['content:encoded']);
      const sourceUrl = readNodeText(item.link) || readNodeText(item.guid);

      return {
        sourceUrl,
        title: cleanFeedText(readNodeText(item.title)),
        description: cleanFeedText(descriptionHtml),
        imageUrl: extractFeedImage(item, sourceUrl, descriptionHtml),
        publishedAt: normalizeDate(
          readNodeText(item.pubDate) || readNodeText(item['dc:date']) || readNodeText(item.updated),
        ),
        tags: ensureArray(item.category).map(readNodeText).filter(Boolean),
        fromClubPage,
      };
    });
  }

  const atomFeed = asRecord(parsed.feed);
  if (!atomFeed) return [];

  return ensureArray(atomFeed.entry).map((rawEntry) => {
    const entry = asRecord(rawEntry) ?? {};
    const descriptionHtml = readNodeText(entry.summary) || readNodeText(entry.content);
    const sourceUrl = extractAtomLink(entry.link);

    return {
      sourceUrl,
      title: cleanFeedText(readNodeText(entry.title)),
      description: cleanFeedText(descriptionHtml),
      imageUrl: extractFeedImage(entry, sourceUrl, descriptionHtml),
      publishedAt: normalizeDate(readNodeText(entry.published) || readNodeText(entry.updated)),
      tags: ensureArray(entry.category)
        .map((category) => readNodeText(asRecord(category)?.term ?? category))
        .filter(Boolean),
      fromClubPage,
    };
  });
}

async function enrichCandidate(
  source: MediaArticleSourceAdapter,
  item: SourceDocumentItem,
): Promise<
  | { candidate: CandidateInsert; reason: string }
  | { url: string; error: string; paywalled?: boolean }
> {
  const sourceUrl = normalizeCandidateUrl(item.sourceUrl);
  if (!sourceUrl) {
    return { url: item.sourceUrl, error: 'Invalid article URL' };
  }

  let title = item.title;
  let description = item.description ?? '';
  let imageUrl = sanitizeNewsHeroImageUrl(item.imageUrl, sourceUrl);
  let canonicalUrl = sourceUrl;
  let publishedAt = item.publishedAt ?? null;

  try {
    const article = await fetchArticleMedia(sourceUrl, ARTICLE_TIMEOUT_MS, USER_AGENT);

    if (isPaywalledDocument(article.html)) {
      return {
        url: sourceUrl,
        error: 'Skipped because a login or paywall was detected',
        paywalled: true,
      };
    }

    const metadata = extractArticleMetadata(article.html, article.resolvedUrl, {
      siteNameHint: source.sourceName,
      defaultSiteName: source.sourceName,
    });

    canonicalUrl =
      extractCanonicalUrl(article.html, article.resolvedUrl) ??
      normalizeCandidateUrl(article.resolvedUrl) ??
      sourceUrl;
    title = metadata.title || title;
    description = metadata.description || description;
    imageUrl = metadata.media.imageUrl || imageUrl;
    publishedAt = extractPublishedAt(article.html) || publishedAt;
  } catch (error) {
    // Listing/feed metadata remains useful when an outlet blocks detail fetches.
    console.log(
      `[media-candidates] metadata_fallback source=${source.key} url=${sourceUrl} error=${toErrorMessage(error)}`,
    );
  }

  const relevance = scoreMediaArticleCandidate({
    title,
    description,
    url: canonicalUrl,
    tags: item.tags,
    fromClubPage: item.fromClubPage,
  });

  if (!relevance.accepted) {
    return {
      url: canonicalUrl,
      error: relevance.reason,
    };
  }

  return {
    reason: relevance.reason,
    candidate: {
      source_key: source.key,
      source_name: source.sourceName,
      source_url: sourceUrl,
      canonical_url: canonicalUrl,
      title: truncate(cleanText(title), 240),
      description: nullableText(truncate(cleanText(description), 600)),
      image_url: imageUrl,
      published_at: normalizeDate(publishedAt),
      detected_keywords: relevance.detectedKeywords,
      relevance_score: relevance.score,
      status: 'pending',
    },
  };
}

async function loadExistingUrls(
  supabase: ReturnType<typeof createClient>,
): Promise<ExistingUrlSets> {
  const [{ data: candidateRows, error: candidateError }, { data: postRows, error: postError }] =
    await Promise.all([
      supabase.from('media_article_candidates').select('canonical_url, source_url'),
      supabase.from('posts').select('link_preview').eq('post_type', 'media_article'),
    ]);

  if (candidateError) throw candidateError;
  if (postError) throw postError;

  const candidates = new Set<string>();
  for (const row of candidateRows ?? []) {
    for (const value of [row.canonical_url, row.source_url]) {
      const normalized = normalizeCandidateUrl(String(value ?? ''));
      if (normalized) candidates.add(normalized);
    }
  }

  const posts = new Set<string>();
  for (const row of postRows ?? []) {
    const preview = asRecord(row.link_preview);
    const normalized = normalizeCandidateUrl(String(preview?.url ?? ''));
    if (normalized) posts.add(normalized);
  }

  return { candidates, posts };
}

async function fetchDocument(url: string, timeoutMs: number): Promise<FetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    return {
      body: await decodeResponseText(response),
      contentType: response.headers.get('content-type') ?? '',
      resolvedUrl: response.url || url,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractFeedImage(
  item: Record<string, unknown>,
  articleUrl: string,
  descriptionHtml: string,
): string | null {
  const candidates = [
    ...readUrlNodes(item['media:thumbnail']),
    ...readUrlNodes(item['media:content']),
    ...readUrlNodes(item.enclosure),
    descriptionHtml.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? '',
  ];

  for (const candidate of candidates) {
    const imageUrl = sanitizeNewsHeroImageUrl(candidate, articleUrl);
    if (imageUrl) return imageUrl;
  }

  return null;
}

function readUrlNodes(value: unknown): string[] {
  return ensureArray(value).flatMap((entry) => {
    const record = asRecord(entry);
    return [
      readNodeText(record?.url),
      readNodeText(record?.href),
      readNodeText(record?.['#text']),
    ].filter(Boolean);
  });
}

function extractAtomLink(value: unknown): string {
  for (const entry of ensureArray(value)) {
    const record = asRecord(entry);
    const href = readNodeText(record?.href);
    const rel = readNodeText(record?.rel);
    if (href && (!rel || rel === 'alternate')) return href;
  }

  return readNodeText(value);
}

function extractPublishedAt(html: string): string | null {
  const patterns = [
    /<meta\b[^>]*(?:property|name)=["']article:published_time["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']article:published_time["'][^>]*>/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    const normalized = normalizeDate(value);
    if (normalized) return normalized;
  }

  return null;
}

function cleanFeedText(value: string): string {
  return decodeHtml(fixEncoding(value))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value: string | null | undefined): string {
  return decodeHtml(fixEncoding(value))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readNodeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);

  const record = asRecord(value);
  if (record) {
    return readNodeText(record['#text']) || readNodeText(record.href);
  }

  return '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function nullableText(value: string): string | null {
  return value || null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function addDecision(diagnostic: SourceDiagnostic, decision: SourceDecision): void {
  if (diagnostic.decisions.length < MAX_DECISIONS_PER_SOURCE) {
    diagnostic.decisions.push(decision);
  }
}

async function readRequestedSourceKeys(req: Request): Promise<Set<string> | null> {
  try {
    const body = await req.json();
    const sourceKeys = asRecord(body)?.sourceKeys;
    if (!Array.isArray(sourceKeys) || sourceKeys.length === 0) {
      return null;
    }

    return new Set(
      sourceKeys
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}
