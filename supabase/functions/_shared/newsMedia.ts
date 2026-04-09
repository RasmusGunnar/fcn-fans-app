import { decodeHtml } from "./decodeHtml.ts";
import { decodeResponseText, fixEncoding } from "./textEncoding.ts";

const IMAGE_HINT_REGEX = /\.(avif|bmp|gif|jpe?g|png|webp)(?:$|[?#])/i;
const VIDEO_HINT_REGEX =
  /(?:\.(?:m3u8|m4v|mov|mp4|webm)(?:$|[?#])|youtube\.com|youtu\.be|player\.vimeo|vimeo\.com\/video|\/embed\/|\/player\/|twitter\.com\/i\/cards)/i;
const BAD_ASSET_HINT_REGEX =
  /(favicon|sprite|avatar|badge|apple-touch|mask-icon|manifest|touch-icon|site-icon|launcher-icon)(?!.*(?:hero|cover|poster|thumbnail))/i;
const WEAK_LOGO_HINT_REGEX = /logo/i;
const STRONG_IMAGE_HINT_REGEX = /(hero|cover|poster|thumbnail|article|feature|news|header|lead|share|social|open-graph|opengraph|featured)/i;
const GENERIC_TITLE_PATTERNS = [
  /^ingen titel$/i,
  /^untitled$/i,
  /^facebook(?:-link)?$/i,
  /^instagram(?:-opslag| reel)?$/i,
  /^youtube(?:-video)?$/i,
  /^link$/i,
  /^home$/i,
  /^forside$/i,
  /^log\s+ind\s+på\s+facebook/i,
  /^log\s+into\s+facebook/i,
  /^facebook\s*-\s*log/i,
];
const GENERIC_DESCRIPTION_PATTERNS = [
  /^ingen beskrivelse$/i,
  /^no description$/i,
  /^læs mere\.?$/i,
  /^klik her\.?$/i,
  /^se mere\.?$/i,
  /^share this/i,
  /^log\s+ind\s+på\s+facebook/i,
  /^log\s+into\s+facebook/i,
];

export type ResolvedArticleMedia = {
  imageUrl: string | null;
  hasVideo: boolean;
};

export type ResolvedArticleMetadata = {
  title: string;
  description: string;
  siteName: string;
  media: ResolvedArticleMedia;
};

function cleanMetaText(value: string | null | undefined): string {
  return decodeHtml(fixEncoding(value)).replace(/\s+/g, " ").trim();
}

function stripHtmlTags(value: string): string {
  return cleanMetaText(value.replace(/<[^>]*>/g, " "));
}

function truncateText(value: string, maxLength: number): string {
  const cleaned = cleanMetaText(value);
  if (!cleaned || cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
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

function findHeadingTag(html: string, tagName: "h1" | "p"): string {
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = html.match(regex);
  return stripHtmlTags(match?.[1] ?? "");
}

function extractSiteHostname(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function extractSiteLabelFromUrl(baseUrl: string): string {
  const hostname = extractSiteHostname(baseUrl);
  if (!hostname) return "";

  const firstSegment = hostname.split(".")[0] || hostname;
  return cleanMetaText(firstSegment.replace(/[-_]+/g, " "));
}

function normalizeSiteNameCandidate(value: string): string {
  return cleanMetaText(value).replace(/^www\./i, "");
}

function areTitlesEquivalent(a: string, b: string): boolean {
  const normalize = (value: string) =>
    cleanMetaText(value)
      .toLowerCase()
      .replace(/[|–—-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left && right && left === right);
}

function stripSiteSuffixFromTitle(
  title: string,
  siteNameHint: string,
  baseUrl: string,
): string {
  const cleanedTitle = cleanMetaText(title);
  if (!cleanedTitle) return "";

  const hostnameLabel = extractSiteLabelFromUrl(baseUrl);
  const hostname = extractSiteHostname(baseUrl);
  const siteCandidates = [siteNameHint, hostnameLabel, hostname]
    .map(normalizeSiteNameCandidate)
    .filter(Boolean);

  for (const separator of [" | ", " – ", " — ", " - "]) {
    if (!cleanedTitle.includes(separator)) continue;

    const parts = cleanedTitle
      .split(separator)
      .map((part) => cleanMetaText(part))
      .filter(Boolean);

    if (parts.length < 2) continue;

    const trailing = parts[parts.length - 1] || "";
    const mainTitle = parts.slice(0, -1).join(separator).trim();

    if (!mainTitle) continue;

    if (
      siteCandidates.some((siteCandidate) => areTitlesEquivalent(trailing, siteCandidate)) ||
      /(avis|news|nordsjælland|facebook|instagram|youtube|fcn)/i.test(trailing)
    ) {
      return mainTitle;
    }
  }

  return cleanedTitle;
}

function isProbablyTruncated(value: string): boolean {
  const cleaned = cleanMetaText(value);
  return /(?:\.\.\.|…)$/.test(cleaned) || cleaned.includes("… ");
}

function looksLikeUrlOnly(value: string): boolean {
  const cleaned = cleanMetaText(value);
  return /^https?:\/\//i.test(cleaned);
}

function isGenericText(value: string, patterns: RegExp[]): boolean {
  const cleaned = cleanMetaText(value);
  return patterns.some((pattern) => pattern.test(cleaned));
}

export function isWeakArticleTitle(
  value: string | null | undefined,
  baseUrl: string,
  siteNameHints: Array<string | null | undefined> = [],
): boolean {
  const cleaned = cleanMetaText(value);
  if (!cleaned) return true;
  if (cleaned.length < 8) return true;
  if (looksLikeUrlOnly(cleaned)) return true;
  if (isGenericText(cleaned, GENERIC_TITLE_PATTERNS)) return true;
  if (isProbablyTruncated(cleaned) && cleaned.length < 90) return true;

  const hostname = extractSiteHostname(baseUrl);
  const hostnameLabel = extractSiteLabelFromUrl(baseUrl);
  const hints = [hostname, hostnameLabel, ...siteNameHints]
    .map((hint) => normalizeSiteNameCandidate(hint || ""))
    .filter(Boolean);

  if (hints.some((hint) => areTitlesEquivalent(cleaned, hint))) {
    return true;
  }

  return false;
}

export function isWeakArticleDescription(
  value: string | null | undefined,
  titleHint: string | null | undefined = null,
): boolean {
  const cleaned = cleanMetaText(value);
  if (!cleaned) return true;
  if (cleaned.length < 24) return true;
  if (looksLikeUrlOnly(cleaned)) return true;
  if (isGenericText(cleaned, GENERIC_DESCRIPTION_PATTERNS)) return true;
  if (titleHint && areTitlesEquivalent(cleaned, titleHint)) return true;
  if (isProbablyTruncated(cleaned) && cleaned.length < 140) return true;
  return false;
}

export function extractMetaContent(html: string, key: string): string {
  const normalizedKey = key.toLowerCase();
  return findTagAttributeValue(
    html,
    "meta",
    (attributes) =>
      attributes.property?.toLowerCase() === normalizedKey ||
      attributes.name?.toLowerCase() === normalizedKey ||
      attributes.itemprop?.toLowerCase() === normalizedKey,
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

function extractSrcsetCandidate(srcset: string | null | undefined): string {
  const cleaned = cleanMetaText(srcset);
  if (!cleaned) return "";

  const entries = cleaned
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) return "";

  const lastEntry = entries[entries.length - 1] || "";
  return cleanMetaText(lastEntry.split(/\s+/)[0] || "");
}

type JsonLdNode = Record<string, unknown> | Array<unknown>;

function extractJsonLdNodes(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptRegex)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    const cleaned = raw.replace(/^\s*<!--/, "").replace(/-->\s*$/, "").trim();
    if (!cleaned) continue;

    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && (Array.isArray(parsed) || typeof parsed === "object")) {
        nodes.push(parsed as JsonLdNode);
      }
    } catch {
      // Ignore invalid JSON-LD payloads
    }
  }

  return nodes;
}

function walkJsonLd(node: unknown, visitor: (value: Record<string, unknown>) => boolean | void): boolean {
  if (Array.isArray(node)) {
    for (const child of node) {
      if (walkJsonLd(child, visitor)) return true;
    }
    return false;
  }

  if (!node || typeof node !== "object") {
    return false;
  }

  const record = node as Record<string, unknown>;
  if (visitor(record)) {
    return true;
  }

  for (const value of Object.values(record)) {
    if (walkJsonLd(value, visitor)) {
      return true;
    }
  }

  return false;
}

function asString(value: unknown): string {
  if (typeof value === "string") return cleanMetaText(value);
  if (typeof value === "number") return String(value);
  return "";
}

function extractJsonLdText(html: string, keys: string[]): string {
  const normalizedKeys = keys.map((key) => key.toLowerCase());
  let resolved = "";

  for (const node of extractJsonLdNodes(html)) {
    if (
      walkJsonLd(node, (record) => {
        for (const [key, value] of Object.entries(record)) {
          if (!normalizedKeys.includes(key.toLowerCase())) continue;

          const stringValue = asString(value);
          if (stringValue) {
            resolved = stringValue;
            return true;
          }

          if (value && typeof value === "object" && !Array.isArray(value)) {
            const nestedValue =
              asString((value as Record<string, unknown>).name) ||
              asString((value as Record<string, unknown>).headline) ||
              asString((value as Record<string, unknown>).text) ||
              asString((value as Record<string, unknown>).url);
            if (nestedValue) {
              resolved = nestedValue;
              return true;
            }
          }
        }

        return false;
      })
    ) {
      break;
    }
  }

  return resolved;
}

function extractJsonLdSiteName(html: string): string {
  let resolved = "";

  for (const node of extractJsonLdNodes(html)) {
    if (
      walkJsonLd(node, (record) => {
        const publisher = record.publisher;
        const isPartOf = record.isPartOf;
        const provider = record.provider;

        const candidates = [
          publisher,
          isPartOf,
          provider,
          record.publisherName,
          record.sourceOrganization,
          record.source,
        ];

        for (const candidate of candidates) {
          const stringValue = asString(candidate);
          if (stringValue) {
            resolved = stringValue;
            return true;
          }

          if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
            const nestedValue =
              asString((candidate as Record<string, unknown>).name) ||
              asString((candidate as Record<string, unknown>).legalName);
            if (nestedValue) {
              resolved = nestedValue;
              return true;
            }
          }
        }

        return false;
      })
    ) {
      break;
    }
  }

  return resolved;
}

function extractJsonLdImage(html: string): string {
  let resolved = "";

  const readImageCandidate = (value: unknown): string => {
    if (!value) return "";
    if (typeof value === "string") return cleanMetaText(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = readImageCandidate(item);
        if (nested) return nested;
      }
      return "";
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      return (
        asString(record.url) ||
        asString(record.contentUrl) ||
        asString(record.thumbnailUrl) ||
        asString(record["@id"])
      );
    }
    return "";
  };

  for (const node of extractJsonLdNodes(html)) {
    if (
      walkJsonLd(node, (record) => {
        const imageCandidate = readImageCandidate(record.image) || readImageCandidate(record.thumbnailUrl);
        if (imageCandidate) {
          resolved = imageCandidate;
          return true;
        }

        return false;
      })
    ) {
      break;
    }
  }

  return resolved;
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

type ImageCandidateSource =
  | "video_poster"
  | "og_image_secure"
  | "og_image_url"
  | "og_image"
  | "twitter_image"
  | "meta_image"
  | "image_src"
  | "jsonld_image"
  | "img_tag";

type ImageCandidate = {
  rawUrl: string;
  source: ImageCandidateSource;
  contextHint?: string;
};

function getImageSourceBaseScore(source: ImageCandidateSource): number {
  switch (source) {
    case "video_poster":
      return 120;
    case "og_image_secure":
      return 110;
    case "og_image_url":
      return 108;
    case "og_image":
      return 105;
    case "twitter_image":
      return 100;
    case "meta_image":
      return 94;
    case "image_src":
      return 90;
    case "jsonld_image":
      return 88;
    case "img_tag":
      return 72;
    default:
      return 0;
  }
}

function scoreImageCandidate(url: string, source: ImageCandidateSource, contextHint = ""): number {
  const lower = url.toLowerCase();
  const combinedHint = `${lower} ${contextHint.toLowerCase()}`.trim();
  let score = getImageSourceBaseScore(source);

  if (STRONG_IMAGE_HINT_REGEX.test(combinedHint)) {
    score += 18;
  }

  if (IMAGE_HINT_REGEX.test(lower)) {
    score += 4;
  }

  if (/(share|social|opengraph|open-graph|featured|featured-image)/i.test(combinedHint)) {
    score += 8;
  }

  if (isLikelyBadAsset(lower)) {
    score -= 60;
  }

  if (/(icon|apple-touch|mask-icon|favicon)/i.test(combinedHint)) {
    score -= 40;
  }

  return score;
}

function extractImageTagCandidates(html: string): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];
  const tagRegex = /<img\b[^>]*>/gi;

  for (const match of html.matchAll(tagRegex)) {
    const tagHtml = match[0];
    if (!tagHtml) continue;

    const attributes = parseTagAttributes(tagHtml);
    const contextHint = [
      attributes.class,
      attributes.id,
      attributes.alt,
      attributes["data-testid"],
      attributes["data-image-role"],
    ]
      .filter(Boolean)
      .join(" ");

    const rawCandidates = [
      attributes["data-src"],
      attributes["data-lazy-src"],
      attributes["data-original"],
      attributes["data-image"],
      extractSrcsetCandidate(attributes.srcset),
      attributes.src,
    ]
      .map((value) => cleanMetaText(value))
      .filter(Boolean);

    for (const rawUrl of rawCandidates) {
      candidates.push({
        rawUrl,
        source: "img_tag",
        contextHint,
      });
    }
  }

  return candidates;
}

export function extractArticleMedia(html: string, baseUrl: string): ResolvedArticleMedia {
  const hasVideo = hasVideoSignals(html);
  const candidates: ImageCandidate[] = [
    { rawUrl: extractVideoPoster(html), source: "video_poster" },
    { rawUrl: extractMetaContent(html, "og:image:secure_url"), source: "og_image_secure" },
    { rawUrl: extractMetaContent(html, "og:image:url"), source: "og_image_url" },
    { rawUrl: extractMetaContent(html, "og:image"), source: "og_image" },
    { rawUrl: extractMetaContent(html, "twitter:image"), source: "twitter_image" },
    { rawUrl: extractMetaContent(html, "twitter:image:src"), source: "twitter_image" },
    { rawUrl: extractMetaContent(html, "image"), source: "meta_image" },
    { rawUrl: extractLinkHref(html, "image_src"), source: "image_src" },
    { rawUrl: extractJsonLdImage(html), source: "jsonld_image" },
    ...extractImageTagCandidates(html),
  ];

  let bestCandidate: { url: string; score: number } | null = null;

  for (const candidate of candidates) {
    const imageUrl = sanitizeNewsHeroImageUrl(candidate.rawUrl, baseUrl);
    if (!imageUrl) continue;

    const score = scoreImageCandidate(imageUrl, candidate.source, candidate.contextHint);
    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { url: imageUrl, score };
    }
  }

  return { imageUrl: bestCandidate?.url ?? null, hasVideo };
}

function pickBestTextCandidate(
  candidates: string[],
  isWeak: (value: string) => boolean,
): string {
  const cleanedCandidates = candidates.map((candidate) => cleanMetaText(candidate)).filter(Boolean);

  for (const candidate of cleanedCandidates) {
    if (!isWeak(candidate)) {
      return candidate;
    }
  }

  return cleanedCandidates[0] || "";
}

export function extractArticleMetadata(
  html: string,
  baseUrl: string,
  options: {
    siteNameHint?: string | null;
    defaultSiteName?: string | null;
  } = {},
): ResolvedArticleMetadata {
  const siteNameHint = cleanMetaText(options.siteNameHint);
  const defaultSiteName = cleanMetaText(options.defaultSiteName);

  const rawTitleTag = extractTitleTag(html);
  const normalizedTitleTag = stripSiteSuffixFromTitle(rawTitleTag, siteNameHint, baseUrl);
  const h1Title = findHeadingTag(html, "h1");
  const title = truncateText(
    pickBestTextCandidate(
      [
        extractMetaContent(html, "og:title"),
        extractMetaContent(html, "twitter:title"),
        extractMetaContent(html, "headline"),
        extractJsonLdText(html, ["headline", "name"]),
        h1Title,
        normalizedTitleTag,
      ],
      (value) => isWeakArticleTitle(value, baseUrl, [siteNameHint, defaultSiteName]),
    ),
    200,
  );

  const firstParagraph = findHeadingTag(html, "p");
  const description = truncateText(
    pickBestTextCandidate(
      [
        extractMetaContent(html, "og:description"),
        extractMetaContent(html, "twitter:description"),
        extractMetaContent(html, "description"),
        extractMetaContent(html, "abstract"),
        extractJsonLdText(html, ["description"]),
        firstParagraph,
      ],
      (value) => isWeakArticleDescription(value, title),
    ),
    500,
  );

  const siteName = truncateText(
    pickBestTextCandidate(
      [
        extractMetaContent(html, "og:site_name"),
        extractMetaContent(html, "application-name"),
        extractJsonLdSiteName(html),
        siteNameHint,
        extractSiteLabelFromUrl(baseUrl),
        defaultSiteName,
      ],
      (value) => !cleanMetaText(value),
    ),
    80,
  );

  return {
    title,
    description,
    siteName,
    media: extractArticleMedia(html, baseUrl),
  };
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
