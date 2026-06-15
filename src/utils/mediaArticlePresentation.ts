import type { LinkPreview } from '../types/news';
import type { PostType } from '../types/post';
import { getLinkPreviewDomain } from './linkPreview';

export const MEDIA_ARTICLE_LABEL = 'FCN i medierne';
export const MEDIA_ARTICLE_SOURCE_FALLBACK = 'Ekstern kilde';
export const MEDIA_ARTICLE_AVATAR_MODE = 'lazy-image' as const;
export const MEDIA_ARTICLE_EAGER_REMOTE_ASSET_COUNT = 0;

const SOURCE_ALIASES: { aliases: string[]; label: string; initials: string }[] = [
  { aliases: ['bold', 'bold.dk'], label: 'Bold.dk', initials: 'B' },
  { aliases: ['tipsbladet', 'tipsbladet.dk'], label: 'Tipsbladet', initials: 'T' },
  { aliases: ['fcn', 'fcn.dk'], label: 'FCN.dk', initials: 'FCN' },
  { aliases: ['campo', 'campo.dk'], label: 'Campo', initials: 'C' },
  { aliases: ['tv2', 'tv 2', 'tv2.dk'], label: 'TV 2', initials: 'TV2' },
  { aliases: ['youtube', 'youtube.com'], label: 'YouTube', initials: 'YT' },
  { aliases: ['facebook', 'facebook.com'], label: 'Facebook', initials: 'F' },
  { aliases: ['instagram', 'instagram.com'], label: 'Instagram', initials: 'I' },
];

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeSourceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function getKnownSource(value: string) {
  const sourceKey = normalizeSourceKey(value);

  for (const source of SOURCE_ALIASES) {
    if (
      source.aliases.some(
        (alias) => sourceKey === alias || sourceKey.endsWith(`.${alias}`),
      )
    ) {
      return source;
    }
  }

  return null;
}

function formatGenericSource(value: string): string {
  const normalized = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');

  if (!normalized) {
    return MEDIA_ARTICLE_SOURCE_FALLBACK;
  }

  if (normalized === normalized.toUpperCase()) {
    return normalized;
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

export function getMediaArticleSourceName(preview: LinkPreview | null | undefined): string {
  const metadataSource =
    readOptionalString(preview?.siteName) ??
    readOptionalString(preview?.sourceName) ??
    readOptionalString(preview?.provider);
  const domain = getLinkPreviewDomain(preview?.url);
  const sourceCandidate = metadataSource ?? domain;

  if (!sourceCandidate) {
    return MEDIA_ARTICLE_SOURCE_FALLBACK;
  }

  return getKnownSource(sourceCandidate)?.label ?? formatGenericSource(sourceCandidate);
}

export function getMediaArticleSourceInitials(sourceName: string): string {
  const knownSource = getKnownSource(sourceName);
  if (knownSource) {
    return knownSource.initials;
  }

  const words = sourceName
    .replace(/\.[a-z]{2,}$/i, '')
    .split(/[\s.-]+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  return sourceName.slice(0, 2).toUpperCase() || 'EK';
}

function getMediaArticleAvatarUrl(
  preview: LinkPreview | null | undefined,
): string | null {
  const metadataUrl =
    readOptionalString(preview?.faviconUrl) ??
    readOptionalString(preview?.iconUrl) ??
    readOptionalString(preview?.sourceLogoUrl) ??
    readOptionalString(preview?.logoUrl);

  if (metadataUrl) {
    return metadataUrl;
  }

  const domain = getLinkPreviewDomain(preview?.url);
  if (!domain) {
    return null;
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function getMediaArticleHeaderPresentation(
  postType: PostType,
  preview: LinkPreview | null | undefined,
): {
  sourceName: string;
  secondaryLabel: string;
  initials: string;
  avatarUrl: string | null;
  avatarMode: typeof MEDIA_ARTICLE_AVATAR_MODE;
  eagerRemoteAssetCount: typeof MEDIA_ARTICLE_EAGER_REMOTE_ASSET_COUNT;
  accessibilityLabel: string;
} | null {
  if (postType !== 'media_article') {
    return null;
  }

  const sourceName = getMediaArticleSourceName(preview);

  return {
    sourceName,
    secondaryLabel: MEDIA_ARTICLE_LABEL,
    initials: getMediaArticleSourceInitials(sourceName),
    avatarUrl: getMediaArticleAvatarUrl(preview),
    avatarMode: MEDIA_ARTICLE_AVATAR_MODE,
    eagerRemoteAssetCount: MEDIA_ARTICLE_EAGER_REMOTE_ASSET_COUNT,
    accessibilityLabel: `${sourceName} \u00b7 ${MEDIA_ARTICLE_LABEL}`,
  };
}
