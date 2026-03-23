import type { LinkPreview } from '../types/news';
import type { PostLinkPreview, PostLinkProvider } from '../types/post';
import { cleanText } from './text';

const FIRST_URL_REGEX =
  /(?:https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|(?:instagram\.com|facebook\.com|fb\.watch)(?:\/[^\s<>()]*)?)/i;
const TRAILING_URL_PUNCTUATION_REGEX = /[),.!?:;"'\]]+$/;

function trimTrailingUrlPunctuation(value: string): string {
  return value.replace(TRAILING_URL_PUNCTUATION_REGEX, '');
}

function normalizePreviewCopy(value: string | null | undefined): string | null {
  const normalized = cleanText(value).trim();

  if (!normalized || normalized.toLowerCase() === 'ingen titel') {
    return null;
  }

  return normalized;
}

export function normalizeHttpUrl(value: string): string | null {
  const trimmedValue = trimTrailingUrlPunctuation(value.trim());
  if (!trimmedValue) {
    return null;
  }

  const candidate =
    /^https?:\/\//i.test(trimmedValue) ||
    /^www\./i.test(trimmedValue) ||
    /^(instagram\.com|facebook\.com|fb\.watch)(\/|$)/i.test(trimmedValue)
      ? trimmedValue
      : null;

  if (!candidate) {
    return null;
  }

  const withProtocol =
    /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate.replace(/^\/+/, '')}`;

  try {
    const parsedUrl = new URL(withProtocol);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(FIRST_URL_REGEX)?.[0];
  if (!match) {
    return null;
  }

  return normalizeHttpUrl(match);
}

export function getLinkProvider(url: string): PostLinkProvider {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();

    if (hostname.includes('instagram.com')) {
      return 'instagram';
    }

    if (hostname.includes('facebook.com') || hostname === 'fb.watch') {
      return 'facebook';
    }

    return 'generic';
  } catch {
    return 'generic';
  }
}

export function getLinkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return cleanText(url).trim().toLowerCase();
  }
}

export function getLinkProviderLabel(preview: Pick<PostLinkPreview, 'provider' | 'siteName' | 'domain'>): string {
  if (preview.provider === 'instagram') {
    return 'Instagram';
  }

  if (preview.provider === 'facebook') {
    return 'Facebook';
  }

  return preview.siteName?.trim() || preview.domain;
}

export function buildPostLinkPreview(
  url: string,
  preview?: LinkPreview | null,
): PostLinkPreview {
  const normalizedUrl = normalizeHttpUrl(url) ?? url;
  const domain = getLinkDomain(normalizedUrl);

  return {
    url: normalizedUrl,
    provider: getLinkProvider(normalizedUrl),
    domain,
    title: normalizePreviewCopy(preview?.title),
    description: normalizePreviewCopy(preview?.description),
    imageUrl: cleanText(preview?.imageUrl).trim() || null,
    siteName: normalizePreviewCopy(preview?.siteName) ?? domain,
  };
}

export function normalizePostLinkPreview(raw: unknown): PostLinkPreview | null {
  if (typeof raw === 'string') {
    try {
      return normalizePostLinkPreview(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const rawUrl = typeof value.url === 'string' ? value.url : null;
  const normalizedUrl = rawUrl ? normalizeHttpUrl(rawUrl) : null;

  if (!normalizedUrl) {
    return null;
  }

  const preview = buildPostLinkPreview(normalizedUrl, {
    url: normalizedUrl,
    title: typeof value.title === 'string' ? value.title : undefined,
    description: typeof value.description === 'string' ? value.description : undefined,
    imageUrl:
      typeof value.imageUrl === 'string'
        ? value.imageUrl
        : typeof value.image_url === 'string'
          ? value.image_url
          : undefined,
    siteName:
      typeof value.siteName === 'string'
        ? value.siteName
        : typeof value.site_name === 'string'
          ? value.site_name
          : undefined,
  });

  const providerValue = value.provider;
  if (
    providerValue === 'instagram' ||
    providerValue === 'facebook' ||
    providerValue === 'generic'
  ) {
    preview.provider = providerValue;
  }

  const domainValue = typeof value.domain === 'string' ? cleanText(value.domain).trim().toLowerCase() : null;
  if (domainValue) {
    preview.domain = domainValue;
  }

  return preview;
}

export function isMissingLinkPreviewColumnError(error: {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): boolean {
  const haystack = [error?.message, error?.details, error?.hint].join(' ').toLowerCase();
  return haystack.includes('link_preview') && (haystack.includes('column') || haystack.includes('schema cache'));
}
