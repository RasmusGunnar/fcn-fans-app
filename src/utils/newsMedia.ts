import { cleanText } from './text';

const VIDEO_HINT_REGEX =
  /(?:\.(?:m3u8|m4v|mov|mp4|webm)(?:$|[?#])|youtube\.com|youtu\.be|player\.vimeo|vimeo\.com\/video|\/embed\/|\/player\/|twitter\.com\/i\/cards)/i;
const BAD_ASSET_HINT_REGEX = /(favicon|sprite|avatar|badge)(?!.*(?:hero|cover|poster|thumbnail))/i;
const WEAK_LOGO_HINT_REGEX = /logo/i;
const STRONG_IMAGE_HINT_REGEX = /(hero|cover|poster|thumbnail|article|feature|news|header|lead)/i;

export function sanitizeNewsHeroImageUrl(
  input: string | null | undefined,
  baseUrl?: string | null,
): string | null {
  const cleaned = cleanText(input).trim();
  if (!cleaned) return null;

  let absolute: string;
  try {
    absolute = baseUrl ? new URL(cleaned, baseUrl).href : new URL(cleaned).href;
  } catch {
    return null;
  }

  if (!/^https?:\/\//i.test(absolute)) return null;
  if (VIDEO_HINT_REGEX.test(absolute)) return null;

  const lower = absolute.toLowerCase();
  if (BAD_ASSET_HINT_REGEX.test(lower)) return null;
  if (WEAK_LOGO_HINT_REGEX.test(lower) && !STRONG_IMAGE_HINT_REGEX.test(lower)) return null;

  return absolute;
}
