import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";
import { decodeHtml } from "../_shared/decodeHtml.ts";
import {
  extractArticleMetadata,
  fetchArticleMedia,
  isWeakArticleDescription,
  isWeakArticleTitle,
  sanitizeNewsHeroImageUrl,
} from "../_shared/newsMedia.ts";
import { decodeResponseText, fixEncoding } from "../_shared/textEncoding.ts";

type FeedResult = {
  feedUrl: string;
  fetched: boolean;
  parsed: number;
  upserted: number;
  error?: string;
};

type NewsItem = {
  url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  created_at: string;
};

const DEFAULT_ACTOR_USER_ID = "7f7af610-6ea3-480e-a531-3cc1f30862eb";
const MAX_ITEMS_PER_RUN = 100;
const FETCH_TIMEOUT_MS = 12000;
const USER_AGENT = "fcn-fans-news-sync/1.0";

Deno.serve(async () => {
  const startedAt = new Date();
  const errors: string[] = [];

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const rssUrlsRaw = Deno.env.get("NEWS_RSS_URLS") || "";
  const actorUserId = Deno.env.get("NEWS_ACTOR_USER_ID") || DEFAULT_ACTOR_USER_ID;
  const defaultSiteName = Deno.env.get("NEWS_DEFAULT_SITE_NAME") || "FCN News";

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      {
        feeds: 0,
        fetched: 0,
        parsed: 0,
        upserted: 0,
        errors: ["Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"],
      },
      500,
    );
  }

  const feedUrls = rssUrlsRaw
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  if (feedUrls.length === 0) {
    return jsonResponse(
      {
        feeds: 0,
        fetched: 0,
        parsed: 0,
        upserted: 0,
        errors: ["No NEWS_RSS_URLS configured"],
      },
      400,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
  });

  let totalFetched = 0;
  let totalParsed = 0;
  let totalUpserted = 0;
  const seenUrls = new Set<string>();
  const feedResults: FeedResult[] = [];

  for (const feedUrl of feedUrls) {
    const feedResult: FeedResult = {
      feedUrl,
      fetched: false,
      parsed: 0,
      upserted: 0,
    };

    try {
      const xmlText = await fetchWithTimeout(feedUrl, FETCH_TIMEOUT_MS);
      feedResult.fetched = true;
      totalFetched += 1;

      const parsed = parser.parse(xmlText);
      const items = await enrichItemsWithMedia(extractItems(parsed, defaultSiteName), defaultSiteName);
      const uniqueItems = items.filter((item) => {
        if (!item.url || !item.title) return false;
        if (seenUrls.has(item.url)) return false;
        seenUrls.add(item.url);
        return true;
      });

      const limitedItems = uniqueItems.slice(0, Math.max(0, MAX_ITEMS_PER_RUN - totalParsed));
      feedResult.parsed = limitedItems.length;
      totalParsed += limitedItems.length;

      if (limitedItems.length > 0) {
        const payload = limitedItems.map((item) => ({
          url: item.url,
          title: item.title,
          description: item.description,
          image_url: item.image_url,
          site_name: item.site_name,
          actor_type: "user",
          actor_id: actorUserId,
          created_by: actorUserId,
          created_at: item.created_at,
        }));

        const { error } = await supabase
          .from("news_items")
          .upsert(payload, { onConflict: "url" });

        if (error) {
          throw new Error(`Upsert failed: ${error.message}`);
        }

        feedResult.upserted = payload.length;
        totalUpserted += payload.length;
      }

      console.log(
        `[news-sync] feed=${feedUrl} fetched=1 parsed=${feedResult.parsed} upserted=${feedResult.upserted}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      feedResult.error = message;
      errors.push(`${feedUrl}: ${message}`);
      console.log(`[news-sync] feed=${feedUrl} error=${message}`);
    }

    feedResults.push(feedResult);

    if (totalParsed >= MAX_ITEMS_PER_RUN) {
      break;
    }
  }

  return jsonResponse({
    feeds: feedUrls.length,
    fetched: totalFetched,
    parsed: totalParsed,
    upserted: totalUpserted,
    errors,
    runtime_ms: Date.now() - startedAt.getTime(),
    results: feedResults,
  });
});

function extractItems(parsed: Record<string, unknown>, defaultSiteName: string): NewsItem[] {
  if (parsed?.rss?.channel) {
    return extractRssItems(parsed.rss.channel, defaultSiteName);
  }

  if (parsed?.feed) {
    return extractAtomItems(parsed.feed, defaultSiteName);
  }

  return [];
}

function extractRssItems(channel: Record<string, unknown>, defaultSiteName: string): NewsItem[] {
  const siteName = decodeHtml(fixEncoding(safeText(channel?.title))) || defaultSiteName;
  const rawItems = ensureArray(channel?.item);
  return rawItems.map((item) => {
    const link = safeText(item?.link);
    const description = safeText(item?.description) || safeText(item?.["content:encoded"]);
    const imageUrl = extractFeedImageUrl(item, link, description);
    const createdAt = parseDate(
      safeText(item?.pubDate) || safeText(item?.["dc:date"]) || safeText(item?.updated),
    );

    return {
      url: link,
      title: decodeHtml(fixEncoding(safeText(item?.title))),
      description: truncateText(decodeHtml(fixEncoding(stripHtml(description))), 500),
      image_url: imageUrl,
      site_name: siteName,
      created_at: createdAt,
    };
  });
}

function extractAtomItems(feed: Record<string, unknown>, defaultSiteName: string): NewsItem[] {
  const siteName = decodeHtml(fixEncoding(safeText(feed?.title))) || defaultSiteName;
  const rawItems = ensureArray(feed?.entry);
  return rawItems.map((entry) => {
    const link = extractAtomLink(entry?.link);
    const description = safeText(entry?.summary) || safeText(entry?.content);
    const imageUrl = extractFeedImageUrl(entry, link, description);
    const createdAt = parseDate(safeText(entry?.updated) || safeText(entry?.published));

    return {
      url: link,
      title: decodeHtml(fixEncoding(safeText(entry?.title))),
      description: truncateText(decodeHtml(fixEncoding(stripHtml(description))), 500),
      image_url: imageUrl,
      site_name: siteName,
      created_at: createdAt,
    };
  });
}

function isWeakSiteName(siteName: string | null | undefined, defaultSiteName: string): boolean {
  const cleaned = decodeHtml(fixEncoding(siteName)).trim();
  if (!cleaned) return true;
  return cleaned.toLowerCase() === defaultSiteName.trim().toLowerCase();
}

async function enrichItemsWithMedia(
  items: NewsItem[],
  defaultSiteName: string,
): Promise<NewsItem[]> {
  return await Promise.all(
    items.map(async (item) => {
      const sanitizedFeedImage = sanitizeNewsHeroImageUrl(item.image_url, item.url);
      const weakTitle = isWeakArticleTitle(item.title, item.url, [item.site_name, defaultSiteName]);
      const weakDescription = isWeakArticleDescription(item.description, item.title);
      const weakSiteName = isWeakSiteName(item.site_name, defaultSiteName);

      if (sanitizedFeedImage && !weakTitle && !weakDescription && !weakSiteName) {
        return { ...item, image_url: sanitizedFeedImage };
      }

      if (!item.url) {
        return { ...item, image_url: sanitizedFeedImage };
      }

      try {
        const article = await fetchArticleMedia(item.url, FETCH_TIMEOUT_MS, USER_AGENT);
        const metadata = extractArticleMetadata(article.html, article.resolvedUrl, {
          siteNameHint: item.site_name,
          defaultSiteName,
        });

        return {
          ...item,
          title: weakTitle ? metadata.title || item.title : item.title,
          description: weakDescription ? metadata.description || item.description : item.description,
          image_url: sanitizedFeedImage || metadata.media.imageUrl || null,
          site_name: weakSiteName ? metadata.siteName || item.site_name : item.site_name,
        };
      } catch {
        return {
          ...item,
          image_url: sanitizedFeedImage || null,
        };
      }
    }),
  );
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, text/xml, application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    return await decodeResponseText(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractAtomLink(linkNode: unknown): string {
  const linkArray = ensureArray(linkNode);
  for (const link of linkArray) {
    const href = safeText(link?.href);
    const rel = safeText(link?.rel);
    if (href && (!rel || rel === "alternate")) {
      return href;
    }
  }

  return safeText(linkNode?.href) || "";
}

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractUrlsFromNode(value: unknown): string[] {
  return ensureArray(value)
    .flatMap((node) => {
      if (typeof node === "string") {
        return [safeText(node)];
      }

      if (node && typeof node === "object") {
        return [
          safeText((node as Record<string, unknown>).url),
          safeText((node as Record<string, unknown>).href),
          safeText((node as Record<string, unknown>)["#text"]),
        ];
      }

      return [];
    })
    .filter(Boolean);
}

function extractFeedImageUrl(
  item: Record<string, unknown>,
  link: string,
  descriptionHtml: string,
): string | null {
  const candidates = [
    ...extractUrlsFromNode(item?.["media:thumbnail"]),
    ...extractUrlsFromNode(item?.["media:content"]),
    ...extractUrlsFromNode(item?.enclosure),
    extractImageFromHtml(descriptionHtml || ""),
  ];

  for (const candidate of candidates) {
    const imageUrl = sanitizeNewsHeroImageUrl(candidate, link || "https://fcn.dk");
    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

function safeText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object" && value && "#text" in value) {
    const text = (value as { "#text"?: string })["#text"];
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + "…";
}

function extractImageFromHtml(html: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
}

function parseDate(value: string): string {
  if (!value) {
    return new Date().toISOString();
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return new Date().toISOString();
  }
  return new Date(timestamp).toISOString();
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
