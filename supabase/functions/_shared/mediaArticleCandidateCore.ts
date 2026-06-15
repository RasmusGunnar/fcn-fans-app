export type MediaArticleCandidateStatus = 'pending' | 'approved' | 'rejected' | 'ignored';

export type SourceDocumentItem = {
  sourceUrl: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  publishedAt?: string | null;
  tags?: string[];
  fromClubPage?: boolean;
};

export type CandidateRelevance = {
  accepted: boolean;
  score: number;
  detectedKeywords: string[];
  reason: string;
};

export type HtmlListingOptions = {
  allowedHosts: string[];
  articlePathPrefixes?: string[];
  fromClubPage?: boolean;
  maxItems?: number;
};

export type CandidateApprovalInput = {
  status: MediaArticleCandidateStatus;
  authorId: string;
  canonicalUrl: string;
  sourceName: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  caption?: string | null;
};

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source']);

const SKIPPED_PATH_HINT =
  /(?:\/(?:login|log-in|abonnement|subscribe|privacy|cookie|kontakt|search|sog|tag|author|kategori|category)(?:\/|$)|\.(?:css|gif|jpe?g|js|png|svg|webp)(?:$|[?#]))/i;

function decodeHtmlText(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)));
}

function cleanText(value: string | null | undefined): string {
  return decodeHtmlText(String(value ?? ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

function isAllowedHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const normalized = normalizeHostname(hostname);
  return allowedHosts.some((host) => {
    const allowed = normalizeHostname(host);
    return normalized === allowed || normalized.endsWith(`.${allowed}`);
  });
}

export function normalizeCandidateUrl(value: string, baseUrl?: string): string | null {
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';
    url.hostname = normalizeHostname(url.hostname);

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }

    return url.toString();
  } catch {
    return null;
  }
}

function findKeywordMatches(value: string): string[] {
  const normalized = cleanText(value).toLowerCase();
  const matches: string[] = [];

  if (/\bfc\s+nordsj(?:æ|ae)lland\b/i.test(normalized)) {
    matches.push('FC Nordsjælland');
  }
  if (/\bfcn\b/i.test(normalized)) {
    matches.push('FCN');
  }
  if (/\bnordsj(?:æ|ae)lland\b/i.test(normalized)) {
    matches.push('Nordsjælland');
  }

  return matches;
}

function addUnique(target: string[], values: readonly string[]): void {
  for (const value of values) {
    if (!target.includes(value)) {
      target.push(value);
    }
  }
}

export function scoreMediaArticleCandidate(input: {
  title: string;
  description?: string | null;
  url: string;
  tags?: readonly string[];
  fromClubPage?: boolean;
}): CandidateRelevance {
  const detectedKeywords: string[] = [];
  const titleMatches = findKeywordMatches(input.title);
  const descriptionMatches = findKeywordMatches(input.description ?? '');
  let decodedUrl = input.url;
  try {
    decodedUrl = decodeURIComponent(input.url);
  } catch {
    // Keep the original URL when it contains malformed escape sequences.
  }
  const urlMatches = findKeywordMatches(decodedUrl.replace(/[-_/]+/g, ' '));
  const tagMatches = findKeywordMatches((input.tags ?? []).join(' '));
  let score = 0;

  addUnique(detectedKeywords, titleMatches);
  addUnique(detectedKeywords, tagMatches);
  addUnique(detectedKeywords, urlMatches);
  addUnique(detectedKeywords, descriptionMatches);

  if (titleMatches.includes('FC Nordsjælland')) score += 70;
  else if (titleMatches.includes('FCN')) score += 65;
  else if (titleMatches.includes('Nordsjælland')) score += 48;

  if (tagMatches.length > 0) score += 45;
  if (urlMatches.length > 0) score += 35;
  if (descriptionMatches.length > 0) score += 25;
  if (input.fromClubPage) score += 50;

  score = Math.min(100, score);
  const accepted = score >= 40;

  let reason = 'No FCN relevance signal';
  if (accepted && titleMatches.length > 0) {
    reason = 'FCN matched in title';
  } else if (accepted && input.fromClubPage) {
    reason = 'Discovered on an FCN-specific source page';
  } else if (accepted && tagMatches.length > 0) {
    reason = 'FCN matched in tags';
  } else if (accepted && urlMatches.length > 0) {
    reason = 'FCN matched in URL';
  } else if (accepted && descriptionMatches.length > 0) {
    reason = 'FCN matched in description';
  } else if (detectedKeywords.length > 0) {
    reason = 'FCN mention was too peripheral';
  }

  return { accepted, score, detectedKeywords, reason };
}

function readAttribute(tag: string, attributeName: string): string {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(pattern);
  return cleanText(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function isLikelyArticleUrl(url: URL): boolean {
  if (SKIPPED_PATH_HINT.test(`${url.pathname}${url.search}`)) {
    return false;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  return segments.length >= 2;
}

export function extractHtmlListingCandidates(
  html: string,
  pageUrl: string,
  options: HtmlListingOptions,
): SourceDocumentItem[] {
  const candidates: SourceDocumentItem[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>[\s\S]*?<\/a>/gi;
  const maxItems = options.maxItems ?? 80;

  const addCandidate = (rawUrl: string, rawTitle: string): boolean => {
    const decodedUrl = rawUrl.replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    const sourceUrl = normalizeCandidateUrl(decodedUrl, pageUrl);
    if (!sourceUrl || seen.has(sourceUrl)) return false;

    const parsedUrl = new URL(sourceUrl);
    if (!isAllowedHost(parsedUrl.hostname, options.allowedHosts)) return false;
    if (!isLikelyArticleUrl(parsedUrl)) return false;
    if (
      options.articlePathPrefixes?.length &&
      !options.articlePathPrefixes.some((prefix) => parsedUrl.pathname.startsWith(prefix))
    ) {
      return false;
    }

    const title = cleanText(rawTitle);
    if (title.length < 8) return false;

    seen.add(sourceUrl);
    candidates.push({
      sourceUrl,
      title,
      fromClubPage: options.fromClubPage,
    });
    return true;
  };

  for (const match of html.matchAll(anchorPattern)) {
    const anchor = match[0];
    const href = readAttribute(anchor, 'href');
    const title =
      readAttribute(anchor, 'aria-label') ||
      readAttribute(anchor, 'title') ||
      cleanText(anchor.replace(/^<a\b[^>]*>/i, '').replace(/<\/a>$/i, ''));

    addCandidate(href, title);
    if (candidates.length >= maxItems) break;
  }

  if (candidates.length < maxItems) {
    const quotedUrlPattern = /(["'])(https?:\\?\/\\?\/[^"'<>]+|\\?\/[^"'<>]+)\1/g;

    for (const match of html.matchAll(quotedUrlPattern)) {
      const rawUrl = match[2] ?? '';
      const normalizedUrl = normalizeCandidateUrl(
        rawUrl.replace(/\\u002f/gi, '/').replace(/\\\//g, '/'),
        pageUrl,
      );
      if (!normalizedUrl) continue;

      const parsedUrl = new URL(normalizedUrl);
      const slug = parsedUrl.pathname.split('/').filter(Boolean).pop() ?? '';
      const slugTitle = slug
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      addCandidate(rawUrl, slugTitle);
      if (candidates.length >= maxItems) break;
    }
  }

  return candidates;
}

export function dedupeCandidateDiscoveries(items: readonly SourceDocumentItem[]): {
  unique: SourceDocumentItem[];
  duplicateCount: number;
} {
  const seen = new Set<string>();
  const unique: SourceDocumentItem[] = [];
  let duplicateCount = 0;

  for (const item of items) {
    const normalizedUrl = normalizeCandidateUrl(item.sourceUrl);
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(normalizedUrl);
    unique.push({ ...item, sourceUrl: normalizedUrl });
  }

  return { unique, duplicateCount };
}

export function extractCanonicalUrl(html: string, baseUrl: string): string | null {
  const linkPattern = /<link\b[^>]*>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const tag = match[0];
    const rel = readAttribute(tag, 'rel').toLowerCase();
    if (rel.split(/\s+/).includes('canonical')) {
      return normalizeCandidateUrl(readAttribute(tag, 'href'), baseUrl);
    }
  }

  return normalizeCandidateUrl(baseUrl);
}

export function isPaywalledDocument(html: string): boolean {
  return (
    /"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html) ||
    /(?:class|id)=["'][^"']*(?:paywall|subscription-wall|login-wall)[^"']*["']/i.test(html)
  );
}

export function buildApprovedCandidatePostPayload(input: CandidateApprovalInput) {
  if (input.status !== 'pending') {
    throw new TypeError('only pending media article candidates can be approved');
  }

  const authorId = input.authorId.trim();
  const url = normalizeCandidateUrl(input.canonicalUrl);
  const title = cleanText(input.title);
  const sourceName = cleanText(input.sourceName);

  if (!authorId || !url || !title || !sourceName) {
    throw new TypeError('candidate approval requires author, URL, title and source');
  }

  return {
    author_id: authorId,
    actor_type: 'user' as const,
    actor_id: authorId,
    post_type: 'media_article' as const,
    text: cleanText(input.caption),
    media: [],
    feed_targets: ['home'],
    link_preview: {
      url,
      title,
      ...(cleanText(input.description) ? { description: cleanText(input.description) } : {}),
      ...(normalizeCandidateUrl(input.imageUrl ?? '')
        ? { imageUrl: normalizeCandidateUrl(input.imageUrl ?? '') as string }
        : {}),
      siteName: sourceName,
    },
  };
}
