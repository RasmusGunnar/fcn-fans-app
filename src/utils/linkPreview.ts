import type { LinkPreview } from '../types/news';
import { fetchLinkPreview } from '../services/newsApi';
import type { PostLinkPreview, PostLinkProvider } from '../types/post';
import { cleanText } from './text';

const FIRST_URL_REGEX =
  /(?:https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|(?:instagram\.com|facebook\.com|fb\.watch|youtube\.com|youtu\.be)(?:\/[^\s<>()]*)?)/i;
const TRAILING_URL_PUNCTUATION_REGEX = /[),.!?:;"'\]]+$/;
const hydratedPreviewCache = new Map<string, PostLinkPreview>();
const hydratedPreviewPromises = new Map<string, Promise<PostLinkPreview>>();
const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
let linkPreviewColumnAvailable: boolean | null = null;

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
    /^(instagram\.com|facebook\.com|fb\.watch|youtube\.com|youtu\.be)(\/|$)/i.test(trimmedValue)
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

    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      return 'youtube';
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

  if (preview.provider === 'youtube') {
    return 'YouTube';
  }

  return preview.siteName?.trim() || preview.domain;
}

function normalizeYouTubeVideoId(candidate: string | null | undefined): string | null {
  const value = cleanText(candidate).trim();
  return YOUTUBE_VIDEO_ID_REGEX.test(value) ? value : null;
}

export function extractYouTubeVideoId(url: string | null | undefined): string | null {
  const normalizedUrl = normalizeHttpUrl(url ?? '');
  if (!normalizedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(normalizedUrl);
    const hostname = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

    if (hostname === 'youtu.be') {
      return normalizeYouTubeVideoId(pathSegments[0]);
    }

    if (!hostname.includes('youtube.com')) {
      return null;
    }

    if (parsedUrl.pathname === '/watch') {
      return normalizeYouTubeVideoId(parsedUrl.searchParams.get('v'));
    }

    if (pathSegments.length >= 2) {
      const [firstSegment, secondSegment] = pathSegments;

      if (
        firstSegment === 'embed' ||
        firstSegment === 'shorts' ||
        firstSegment === 'live' ||
        firstSegment === 'v'
      ) {
        return normalizeYouTubeVideoId(secondSegment);
      }
    }

    return null;
  } catch {
    return null;
  }
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
    hasVideo: Boolean(preview?.hasVideo),
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
    hasVideo:
      typeof value.hasVideo === 'boolean'
        ? value.hasVideo
        : typeof value.has_video === 'boolean'
          ? value.has_video
          : undefined,
  });

  const providerValue = value.provider;
  if (
    providerValue === 'instagram' ||
    providerValue === 'facebook' ||
    providerValue === 'youtube' ||
    providerValue === 'generic'
  ) {
    preview.provider =
      providerValue === 'generic' && preview.provider !== 'generic'
        ? preview.provider
        : providerValue;
  }

  const domainValue = typeof value.domain === 'string' ? cleanText(value.domain).trim().toLowerCase() : null;
  if (domainValue) {
    preview.domain = domainValue;
  }

  if (typeof value.dismissed === 'boolean') {
    preview.dismissed = value.dismissed;
  }

  return preview;
}

export function resolvePostLinkPreview(
  raw: unknown,
  text?: string | null | undefined,
): PostLinkPreview | null {
  const normalizedPreview = normalizePostLinkPreview(raw);
  if (normalizedPreview) {
    if (normalizedPreview.dismissed) {
      return null;
    }

    return normalizedPreview;
  }

  const detectedUrl = extractFirstUrl(text ?? '');
  return detectedUrl ? buildPostLinkPreview(detectedUrl) : null;
}

export function mergePostLinkPreview(
  base: PostLinkPreview,
  incoming: PostLinkPreview,
): PostLinkPreview {
  return {
    url: normalizeHttpUrl(incoming.url) ?? normalizeHttpUrl(base.url) ?? incoming.url ?? base.url,
    provider: incoming.provider ?? base.provider,
    domain: incoming.domain || base.domain,
    title: incoming.title ?? base.title ?? null,
    description: incoming.description ?? base.description ?? null,
    imageUrl: incoming.imageUrl ?? base.imageUrl ?? null,
    siteName: incoming.siteName ?? base.siteName ?? null,
    hasVideo:
      typeof incoming.hasVideo === 'boolean'
        ? incoming.hasVideo
        : typeof base.hasVideo === 'boolean'
          ? base.hasVideo
          : null,
    dismissed:
      typeof incoming.dismissed === 'boolean'
        ? incoming.dismissed
        : typeof base.dismissed === 'boolean'
          ? base.dismissed
          : null,
  };
}

export function shouldHydratePostLinkPreview(
  preview: PostLinkPreview | null | undefined,
): boolean {
  if (!preview) {
    return false;
  }

  return !preview.imageUrl || !preview.title || preview.siteName === preview.domain;
}

export async function hydratePostLinkPreview(
  preview: PostLinkPreview,
): Promise<PostLinkPreview> {
  const normalizedUrl = normalizeHttpUrl(preview.url);
  if (!normalizedUrl) {
    return preview;
  }

  const cachedPreview = hydratedPreviewCache.get(normalizedUrl);
  if (cachedPreview) {
    return mergePostLinkPreview(preview, cachedPreview);
  }

  const pendingPreview = hydratedPreviewPromises.get(normalizedUrl);
  if (pendingPreview) {
    return pendingPreview.then((result) => mergePostLinkPreview(preview, result));
  }

  const promise = fetchLinkPreview(normalizedUrl)
    .then((result) => {
      const hydratedPreview = buildPostLinkPreview(result.url || normalizedUrl, result);
      hydratedPreviewCache.set(normalizedUrl, hydratedPreview);
      return hydratedPreview;
    })
    .catch(() => preview)
    .finally(() => {
      hydratedPreviewPromises.delete(normalizedUrl);
    });

  hydratedPreviewPromises.set(normalizedUrl, promise);
  return promise.then((result) => mergePostLinkPreview(preview, result));
}

export function isInstagramLinkPreviewWithImage(
  preview: Pick<PostLinkPreview, 'provider' | 'imageUrl'> | null | undefined,
): boolean {
  return preview?.provider === 'instagram' && Boolean(preview.imageUrl);
}

export function isVideoLikeLinkPreview(
  preview: Pick<PostLinkPreview, 'provider' | 'url' | 'title' | 'description' | 'hasVideo'> | null | undefined,
): boolean {
  if (!preview) {
    return false;
  }

  if (preview.hasVideo) {
    return true;
  }

  const haystack = [preview.url, preview.title, preview.description].join(' ').toLowerCase();

  if (
    preview.provider === 'instagram' &&
    (haystack.includes('/reel/') || haystack.includes('/reels/') || haystack.includes('/tv/'))
  ) {
    return true;
  }

  return false;
}

export function getPromotedInstagramLinkPreview(options: {
  hasUploadedMedia: boolean;
  linkPreview?: PostLinkPreview | null;
}): (PostLinkPreview & { mediaKind: 'image' | 'video' }) | null {
  const { hasUploadedMedia, linkPreview } = options;

  if (!linkPreview || hasUploadedMedia || !isInstagramLinkPreviewWithImage(linkPreview)) {
    return null;
  }

  return {
    ...linkPreview,
    mediaKind: isVideoLikeLinkPreview(linkPreview) ? 'video' : 'image',
  };
}

export function stripFirstUrlFromDisplayText(
  text: string | null | undefined,
  expectedUrl?: string | null,
): string {
  const rawText = typeof text === 'string' ? text : '';
  const matchedUrl = rawText.match(FIRST_URL_REGEX)?.[0];

  if (!matchedUrl) {
    return cleanText(rawText).trim();
  }

  const normalizedMatchedUrl = normalizeHttpUrl(matchedUrl);
  const normalizedExpectedUrl = expectedUrl ? normalizeHttpUrl(expectedUrl) : null;

  if (normalizedExpectedUrl && normalizedMatchedUrl && normalizedExpectedUrl !== normalizedMatchedUrl) {
    return cleanText(rawText).trim();
  }

  return cleanText(rawText.replace(matchedUrl, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isMissingLinkPreviewColumnError(error: {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): boolean {
  const haystack = [error?.message, error?.details, error?.hint].join(' ').toLowerCase();
  return haystack.includes('link_preview') && (haystack.includes('column') || haystack.includes('schema cache'));
}

export function canUseLinkPreviewColumn(): boolean {
  return linkPreviewColumnAvailable !== false;
}

export function markLinkPreviewColumnAvailable(): void {
  if (linkPreviewColumnAvailable !== false) {
    linkPreviewColumnAvailable = true;
  }
}

export function markLinkPreviewColumnMissing(): void {
  linkPreviewColumnAvailable = false;
}
