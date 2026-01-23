// Supabase Edge Function: parse-link
// Parses URL and extracts OpenGraph/Twitter Card metadata for link previews
// Deploy with: supabase functions deploy parse-link

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[parse-link] Fetching URL:', url);

    // Fetch the URL with redirect following and user-agent
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FCN-Fans-Bot/1.0)',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error('[parse-link] Fetch failed:', response.status, response.statusText);
      return new Response(
        JSON.stringify({ error: `Failed to fetch URL: ${response.statusText}` }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const html = await response.text();
    const resolvedUrl = response.url; // Final URL after redirects

    console.log('[parse-link] HTML fetched, parsing meta tags...');

    // Parse meta tags
    const getMetaContent = (property: string): string | null => {
      const patterns = [
        new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`, 'i'),
        new RegExp(`<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${property}["']`, 'i'),
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      return null;
    };

    const getTitleTag = (): string | null => {
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return match ? match[1].trim() : null;
    };

    // Extract metadata with fallbacks
    const title =
      getMetaContent('og:title') ||
      getMetaContent('twitter:title') ||
      getTitleTag() ||
      'Ingen titel';

    const description =
      getMetaContent('og:description') ||
      getMetaContent('twitter:description') ||
      getMetaContent('description') ||
      '';

    let imageUrl = getMetaContent('og:image') || getMetaContent('twitter:image') || null;

    // Resolve relative image URL to absolute
    if (imageUrl && !imageUrl.startsWith('http')) {
      try {
        imageUrl = new URL(imageUrl, resolvedUrl).href;
      } catch (e) {
        console.warn('[parse-link] Failed to resolve relative image URL:', e);
        imageUrl = null;
      }
    }

    const siteName = getMetaContent('og:site_name') || new URL(resolvedUrl).hostname;

    const result = {
      resolvedUrl,
      title,
      description,
      imageUrl,
      siteName,
    };

    console.log('[parse-link] Parsed successfully:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[parse-link] Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
