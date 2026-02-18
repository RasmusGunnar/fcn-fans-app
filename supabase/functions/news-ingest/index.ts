import { createClient } from "npm:@supabase/supabase-js@2";

type IngestPayload = {
  url?: string;
  description?: string | null;
  title?: string | null;
  image_url?: string | null;
  site_name?: string | null;
  note?: string | null;
};

type ScrapedMetadata = {
  title: string;
  description: string;
  image_url: string;
  site_name: string;
};

const FETCH_TIMEOUT_MS = 12000;
const USER_AGENT = "fcn-fans-news-ingest/1.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let payload: IngestPayload;
  try {
    payload = (await req.json()) as IngestPayload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  const url = (payload.url || "").trim();
  if (!isValidUrl(url)) {
    return jsonResponse({ ok: false, error: "Invalid url" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    return jsonResponse({ ok: false, error: "Missing Supabase config" }, 500);
  }

  // Parse Authorization header (case-insensitive)
  let token = "";
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  
  if (authHeader) {
    // Handle both "Bearer <token>" and "<token>" formats
    const trimmed = authHeader.trim();
    token = trimmed.toLowerCase().startsWith("bearer ")
      ? trimmed.slice(7).trim()
      : trimmed;
  }

  // DEV logging: Never log the token itself
  if (__DEV__) {
    console.log("[news-ingest] DEV: Auth info:", {
      tokenLength: token.length,
      hasBearerPrefix: authHeader.trim().toLowerCase().startsWith("bearer "),
    });
  }

  if (!token) {
    return jsonResponse({ code: 401, message: "Invalid JWT" }, 401);
  }

  // Create anon client for JWT validation (NOT service role)
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  // Validate token
  const { data: authData, error: authError } = await authClient.auth.getUser(
    token,
  );
  
  if (__DEV__) {
    console.log("[news-ingest] DEV: Auth result:", {
      userFound: !!authData?.user,
      authError: authError?.message,
    });
  }

  if (authError || !authData?.user) {
    return jsonResponse({ code: 401, message: "Invalid JWT" }, 401);
  }

  const user = authData.user;
  const defaultSiteName = Deno.env.get("NEWS_DEFAULT_SITE_NAME") || "";

  // Create service role client for DB operations ONLY
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Check for duplicates using service role client
  const { data: existing, error: existingError } = await adminClient
    .from("news_items")
    .select("id,url,title")
    .eq("created_by", user.id)
    .eq("url", url)
    .maybeSingle();

  if (existingError) {
    console.log({ existingError });
  }

  if (existing) {
    return jsonResponse(
      { ok: true, id: existing.id, url: existing.url, title: existing.title },
      200,
    );
  }

  // User-provided values take priority
  const userDescription = payload.description?.trim() || null;
  const userTitle = payload.title?.trim() || null;
  const userImageUrl = payload.image_url?.trim() || null;
  const userSiteName = payload.site_name?.trim() || null;
  const userNote = payload.note?.trim() || null;

  // Validate note length (max 280 chars, same as UI)
  if (userNote && userNote.length > 280) {
    return jsonResponse(
      { ok: false, error: "Note exceeds maximum length of 280 characters" },
      422
    );
  }

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return jsonResponse({ ok: false, error: message }, 502);
  }

  const metadata = scrapeMetadata(html, {
    siteNameHint: userSiteName || "",
    defaultSiteName,
  });

  // Priority: user-provided > scraped
  const finalTitle = userTitle || metadata.title;
  const finalDescription = userDescription || metadata.description || null;
  const finalImageUrl = userImageUrl || metadata.image_url || null;
  const finalSiteName = userSiteName || metadata.site_name || null;

  if (!finalTitle) {
    return jsonResponse({ ok: false, error: "Missing title" }, 422);
  }

  const payloadRow = {
    url,
    title: finalTitle,
    description: finalDescription,
    image_url: finalImageUrl,
    site_name: finalSiteName,
    note: userNote,
    actor_type: "user" as const,
    actor_id: user.id,
    created_by: user.id, // Always set from validated user
    created_at: new Date().toISOString(),
  };

  // Use service role client for DB insert
  const { data, error } = await adminClient
    .from("news_items")
    .insert(payloadRow)
    .select("id,url,title")
    .single();

  if (__DEV__) {
    console.log("[news-ingest] DEV: Insert result:", {
      success: !!data && !error,
      hasError: !!error,
    });
  }

  if (error || !data) {
    console.error("[news-ingest] Insert error:", error);
    return jsonResponse({ code: 500, message: "Insert failed" }, 500);
  }

  return jsonResponse(
    { ok: true, id: data.id, url: data.url, title: data.title },
    200,
  );
});

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function scrapeMetadata(
  html: string,
  { siteNameHint, defaultSiteName }: { siteNameHint: string; defaultSiteName: string },
): ScrapedMetadata {
  const title =
    pickFirst(
      extractMetaProperty(html, "og:title"),
      extractMetaProperty(html, "twitter:title"),
      extractTitleTag(html),
    ) || "";

  const description =
    pickFirst(
      extractMetaProperty(html, "og:description"),
      extractMetaProperty(html, "twitter:description"),
      extractMetaName(html, "description"),
    ) || "";

  const imageUrl =
    pickFirst(
      extractMetaProperty(html, "og:image"),
      extractMetaProperty(html, "twitter:image"),
    ) || "";

  const siteName =
    pickFirst(
      extractMetaProperty(html, "og:site_name"),
      siteNameHint,
      extractSiteNameFromBody(html),
      defaultSiteName,
    ) || "";

  return {
    title: limitText(title, 200),
    description: limitText(description, 500),
    image_url: limitText(imageUrl, 500),
    site_name: limitText(siteName, 80),
  };
}

function extractMetaProperty(html: string, property: string): string {
  const regex = new RegExp(
    `<meta[^>]+property=["']${escapeRegex(property)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  return regexMatch(html, regex);
}

function extractMetaName(html: string, name: string): string {
  const regex = new RegExp(
    `<meta[^>]+name=["']${escapeRegex(name)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  return regexMatch(html, regex);
}

function extractTitleTag(html: string): string {
  return regexMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
}

function extractSiteNameFromBody(html: string): string {
  const jsonLike = regexMatch(html, /"site_name"\s*:\s*"([^"]+)"/i);
  if (jsonLike) return jsonLike;
  return regexMatch(html, /site_name\s*=\s*"([^"]+)"/i);
}

function regexMatch(html: string, regex: RegExp): string {
  const match = html.match(regex);
  return match?.[1]?.trim() || "";
}

function pickFirst(...values: string[]): string {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function limitText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength).trim();
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
