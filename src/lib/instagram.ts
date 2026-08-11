import type { LinkPreview } from '../types/news';
import type {
  DatabaseExternalShare,
  ExternalShareResourceType,
  SharedLinkAttachment,
} from '../types/externalShare';

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{5,64}$/;
const USERNAME_PATTERN = /^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/;
const URL_CANDIDATE_PATTERN = /https:\/\/[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION_PATTERN = /[),.!?;:\]}]+$/;
const RESERVED_PROFILE_PATHS = new Set([
  'about',
  'accounts',
  'api',
  'challenge',
  'create',
  'developer',
  'direct',
  'directory',
  'download',
  'emails',
  'explore',
  'graphql',
  'legal',
  'oauth',
  'p',
  'press',
  'privacy',
  'reel',
  'reels',
  'security',
  'share',
  'static',
  'stories',
  'terms',
  'threads',
  'tv',
  'web',
]);

function trimCandidate(value: string): string {
  return value.trim().replace(TRAILING_URL_PUNCTUATION_PATTERN, '');
}

function buildAttachment(
  resourceType: ExternalShareResourceType,
  path: string,
  externalId: string | null,
): SharedLinkAttachment {
  const canonicalUrl = `https://www.instagram.com/${path}`;
  return {
    provider: 'instagram',
    canonicalUrl,
    displayUrl: canonicalUrl,
    resourceType,
    externalId,
  };
}

export function parseInstagramUrl(value: string | null | undefined): SharedLinkAttachment | null {
  if (typeof value !== 'string') return null;
  const candidate = trimCandidate(value);
  if (!candidate || candidate.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    !INSTAGRAM_HOSTS.has(hostname) ||
    url.port ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  if (pathSegments.length === 2) {
    const route = pathSegments[0].toLowerCase();
    const externalId = pathSegments[1];
    if (!SHORTCODE_PATTERN.test(externalId)) return null;

    if (route === 'p') return buildAttachment('post', `p/${externalId}/`, externalId);
    if (route === 'reel' || route === 'reels') {
      return buildAttachment('reel', `reel/${externalId}/`, externalId);
    }
    if (route === 'tv') return buildAttachment('post', `tv/${externalId}/`, externalId);
    return null;
  }

  if (pathSegments.length === 1) {
    const username = pathSegments[0];
    if (RESERVED_PROFILE_PATHS.has(username.toLowerCase()) || !USERNAME_PATTERN.test(username)) {
      return null;
    }
    return buildAttachment('profile', `${username}/`, username);
  }

  return null;
}

export function extractInstagramShare(
  value: string | null | undefined,
): SharedLinkAttachment | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  for (const match of value.matchAll(URL_CANDIDATE_PATTERN)) {
    const parsed = parseInstagramUrl(match[0]);
    if (parsed) return parsed;
  }
  return parseInstagramUrl(value);
}

export function isInstagramUrl(value: string | null | undefined): boolean {
  return parseInstagramUrl(value) !== null;
}

export function getInstagramResourceLabel(resourceType: ExternalShareResourceType): string {
  if (resourceType === 'reel') return 'Reel';
  if (resourceType === 'profile') return 'Profil';
  return 'Opslag';
}

export function getInstagramMessageLabel(resourceType: ExternalShareResourceType): string {
  if (resourceType === 'reel') return 'Instagram-reel';
  if (resourceType === 'profile') return 'Instagram-profil';
  return 'Instagram-opslag';
}

export function toInstagramLinkPreview(attachment: SharedLinkAttachment): LinkPreview {
  return {
    url: attachment.canonicalUrl,
    displayUrl: attachment.displayUrl,
    provider: 'instagram',
    resourceType: attachment.resourceType,
    externalId: attachment.externalId ?? undefined,
    siteName: 'Instagram',
    title: getInstagramResourceLabel(attachment.resourceType),
  };
}

export function fromInstagramLinkPreview(value: unknown): SharedLinkAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.provider !== 'instagram' || typeof record.url !== 'string') return null;
  return parseInstagramUrl(record.url);
}

export function toDatabaseExternalShare(attachment: SharedLinkAttachment): DatabaseExternalShare {
  return {
    provider: attachment.provider,
    canonical_url: attachment.canonicalUrl,
    display_url: attachment.displayUrl,
    resource_type: attachment.resourceType,
    external_id: attachment.externalId,
  };
}

export function fromDatabaseExternalShare(value: unknown): SharedLinkAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.provider !== 'instagram' || typeof record.canonical_url !== 'string') return null;

  const parsed = parseInstagramUrl(record.canonical_url);
  if (!parsed) return null;
  if (
    record.resource_type !== parsed.resourceType ||
    (record.external_id ?? null) !== parsed.externalId
  ) {
    return null;
  }
  return parsed;
}

export function removeStandaloneInstagramUrl(
  value: string,
  attachment: SharedLinkAttachment | null,
): string {
  if (!attachment) return value;
  return parseInstagramUrl(value.trim()) ? '' : value;
}
