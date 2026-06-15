import type { LinkPreview } from '../types/news';

const URL_MATCH_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'`]+/i;
const TRAILING_PUNCTUATION_REGEX = /[),.!?;:]+$/;

function trimTrailingUrlPunctuation(value: string): string {
  let current = value.trim();

  while (TRAILING_PUNCTUATION_REGEX.test(current)) {
    current = current.replace(TRAILING_PUNCTUATION_REGEX, '');
  }

  return current;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeHttpUrl(value: string): string | null {
  const trimmed = trimTrailingUrlPunctuation(value);
  if (!trimmed) {
    return null;
  }

  const normalizedInput = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;

  try {
    const normalizedUrl = new URL(normalizedInput);
    if (normalizedUrl.protocol !== 'http:' && normalizedUrl.protocol !== 'https:') {
      return null;
    }

    return normalizedUrl.toString();
  } catch {
    return null;
  }
}

export function extractFirstUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const match = value.match(URL_MATCH_REGEX);
  if (!match?.[0]) {
    return null;
  }

  return normalizeHttpUrl(match[0]);
}

export function getLinkPreviewDomain(
  url: string | null | undefined,
  options: { stripWww?: boolean } = {},
): string | null {
  const normalizedUrl = typeof url === 'string' ? normalizeHttpUrl(url) : null;
  if (!normalizedUrl) {
    return null;
  }

  try {
    const hostname = new URL(normalizedUrl).hostname || '';
    if (!hostname) {
      return null;
    }

    return options.stripWww === false ? hostname : hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

export function isInstagramUrl(url: string | null | undefined): boolean {
  const hostname = getLinkPreviewDomain(url, { stripWww: false })?.toLowerCase() || '';
  return hostname.includes('instagram.com') || hostname === 'instagr.am';
}

export function normalizeLinkPreview(value: unknown): LinkPreview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const url = normalizeHttpUrl(readOptionalString(record.url) ?? '');
  if (!url) {
    return null;
  }

  const title = readOptionalString(record.title);
  const description = readOptionalString(record.description);
  const imageUrl = normalizeHttpUrl(readOptionalString(record.imageUrl) ?? '');
  const siteName = readOptionalString(record.siteName);
  const sourceName =
    readOptionalString(record.sourceName) ?? readOptionalString(record.source_name);
  const provider = readOptionalString(record.provider);
  const faviconUrl = normalizeHttpUrl(
    readOptionalString(record.faviconUrl) ?? readOptionalString(record.favicon_url) ?? '',
  );
  const iconUrl = normalizeHttpUrl(
    readOptionalString(record.iconUrl) ?? readOptionalString(record.icon_url) ?? '',
  );
  const logoUrl = normalizeHttpUrl(
    readOptionalString(record.logoUrl) ?? readOptionalString(record.logo_url) ?? '',
  );
  const sourceLogoUrl = normalizeHttpUrl(
    readOptionalString(record.sourceLogoUrl) ??
      readOptionalString(record.source_logo_url) ??
      '',
  );
  const hasVideo = typeof record.hasVideo === 'boolean' ? record.hasVideo : undefined;

  return {
    url,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(siteName ? { siteName } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(provider ? { provider } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(sourceLogoUrl ? { sourceLogoUrl } : {}),
    ...(hasVideo !== undefined ? { hasVideo } : {}),
  };
}
