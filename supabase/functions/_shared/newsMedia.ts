import { decodeHtml } from "./decodeHtml.ts";
import { decodeResponseText, fixEncoding } from "./textEncoding.ts";

const IMAGE_HINT_REGEX = /\.(avif|bmp|gif|jpe?g|png|webp)(?:$|[?#])/i;
const VIDEO_HINT_REGEX =
  /(?:\.(?:m3u8|m4v|mov|mp4|webm)(?:$|[?#])|youtube\.com|youtu\.be|player\.vimeo|vimeo\.com\/video|\/embed\/|\/player\/|twitter\.com\/i\/cards)/i;
const BAD_ASSET_HINT_REGEX = /(favicon|sprite|avatar|badge)(?!.*(?:hero|cover|poster|thumbnail))/i;
const WEAK_LOGO_HINT_REGEX = /logo/i;
const STRONG_IMAGE_HINT_REGEX = /(hero|cover|poster|thumbnail|article|feature|news|header|lead)/i;

export type ResolvedArticleMedia = {
  imageUrl: string | null;
  hasVideo: boolean;
};

function cleanMetaText(value: string | null | undefined): string {
  return decodeHtml(fixEncoding(value)).trim();
}

function parseTagAttributes(tagHtml: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex = /([:@\w-]+)\s*=\s*(["'])(.*?)\2/gi;

  for (const match of tagHtml.matchAll(attributeRegex)) {
    const attributeName = match[1]?.toLowerCase();
    const attributeValue = match[3];

    if (attributeName && attributeValue != null) {
      attributes[attributeName] = cleanMetaText(attributeValue);
    }
  }

  return attributes;
}

function findTagAttributeValue(
  html: string,
  tagName: string,
  matcher: (attributes: Record<string, string>) => boolean,
  targetAttribute: string,
): string {
  const tagRegex = new RegExp(`<${tagName}\\b[^>]*>`, "gi");

  for (const match of html.matchAll(tagRegex)) {
    const tagHtml = match[0];
    if (!tagHtml) continue;

    const attributes = parseTagAttributes(tagHtml);
    if (!matcher(attributes)) continue;

    const value = attributes[targetAttribute.toLowerCase()];
    if (value) {
      return value;
    }
  }

  return "";
}

export function extractMetaContent(html: string, key: string): string {
  const normalizedKey = key.toLowerCase();
  return findTagAttributeValue(
    html,
    "meta",
    (attributes) =>
      attributes.property?.toLowerCase() === normalizedKey ||
      attributes.name?.toLowerCase() === normalizedKey,
    "content",
  );
}

function extractLinkHref(html: string, rel: string): string {
  const normalizedRel = rel.toLowerCase();
  return findTagAttributeValue(
    html,
    "link",
    (attributes) => attributes.rel?.toLowerCase() === normalizedRel,
    "href",
  );
}

export function extractTitleTag(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return cleanMetaText(match?.[1] ?? "");
}

function extractVideoPoster(html: string): string {
  const match = html.match(/<video[^>]+poster=["']([^"']+)["']/i);
  return cleanMetaText(match?.[1] ?? "");
}

function extractFirstArticleImage(html: string): string {
  const scopedPatterns = [
    /<article\b[\s\S]*?<img[^>]+src=["']([^"']+)["']/i,
    /<main\b[\s\S]*?<img[^>]+src=["']([^"']+)["']/i,
    /<figure\b[\s\S]*?<img[^>]+src=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i,
  ];

  for (const pattern of scopedPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return cleanMetaText(match[1]);
    }
  }

  return "";
}

function resolveAbsoluteUrl(candidate: string | null | undefined, baseUrl: string): string | null {
  const cleaned = cleanMetaText(candidate);
  if (!cleaned) return null;

  try {
    const absolute = new URL(cleaned, baseUrl).href;
    return /^https?:\/\//i.test(absolute) ? absolute : null;
  } catch {
    return null;
  }
}

function isLikelyVideoUrl(url: string): boolean {
  return VIDEO_HINT_REGEX.test(url);
}

function isLikelyBadAsset(url: string): boolean {
  const lower = url.toLowerCase();
  if (BAD_ASSET_HINT_REGEX.test(lower)) return true;
  if (WEAK_LOGO_HINT_REGEX.test(lower) && !STRONG_IMAGE_HINT_REGEX.test(lower)) return true;
  return false;
}

export function sanitizeNewsHeroImageUrl(
  candidate: string | null | undefined,
  baseUrl: string,
): string | null {
  const absolute = resolveAbsoluteUrl(candidate, baseUrl);
  if (!absolute) return null;
  if (isLikelyVideoUrl(absolute)) return null;
  if (isLikelyBadAsset(absolute) && !IMAGE_HINT_REGEX.test(absolute)) return null;
  return absolute;
}

function hasVideoSignals(html: string): boolean {
  return Boolean(
    extractMetaContent(html, "og:video") ||
      extractMetaContent(html, "og:video:url") ||
      extractMetaContent(html, "twitter:player") ||
      extractMetaContent(html, "twitter:player:stream") ||
      html.match(/<video\b/i) ||
      html.match(/<iframe[^>]+(?:youtube\.com|youtu\.be|vimeo\.com)/i),
  );
}

export function extractArticleMedia(html: string, baseUrl: string): ResolvedArticleMedia {
  const hasVideo = hasVideoSignals(html);
  const candidates = [
    extractVideoPoster(html),
    extractMetaContent(html, "og:image:secure_url"),
    extractMetaContent(html, "og:image:url"),
    extractMetaContent(html, "og:image"),
    extractMetaContent(html, "twitter:image"),
    extractMetaContent(html, "twitter:image:src"),
    extractMetaContent(html, "image"),
    extractLinkHref(html, "image_src"),
    extractFirstArticleImage(html),
  ];

  for (const candidate of candidates) {
    const imageUrl = sanitizeNewsHeroImageUrl(candidate, baseUrl);
    if (imageUrl) {
      return { imageUrl, hasVideo };
    }
  }

  return { imageUrl: null, hasVideo };
}

export async function fetchArticleMedia(
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<{ html: string; resolvedUrl: string; media: ResolvedArticleMedia }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const html = await decodeResponseText(response);
    const resolvedUrl = response.url || url;
    return {
      html,
      resolvedUrl,
      media: extractArticleMedia(html, resolvedUrl),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
