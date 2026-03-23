// Supabase Edge Function: parse-link
// Parses URL and extracts OpenGraph/Twitter Card metadata for link previews
// Deploy with: supabase functions deploy parse-link

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  extractMetaContent,
  extractTitleTag,
  fetchArticleMedia,
} from '../_shared/newsMedia.ts';
import { fixEncoding } from '../_shared/textEncoding.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const FETCH_TIMEOUT_MS = 12000;
const USER_AGENT = 'fcn-fans-parse-link/1.0';

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
    let html = '';
    let resolvedUrl = url;
    let media = { imageUrl: null as string | null, hasVideo: false };

    try {
      const article = await fetchArticleMedia(url, FETCH_TIMEOUT_MS, USER_AGENT);
      html = article.html;
      resolvedUrl = article.resolvedUrl;
      media = article.media;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview fetch failed';
      console.error('[parse-link] Upstream fetch failed:', { url, message });
      return new Response(JSON.stringify({ error: message, stage: 'fetch', url }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[parse-link] HTML fetched, parsing meta tags...');

    // Extract metadata with fallbacks
    const title = fixEncoding(
      extractMetaContent(html, 'og:title') ||
        extractMetaContent(html, 'twitter:title') ||
        extractTitleTag(html) ||
        'Ingen titel',
    );

    const description = fixEncoding(
      extractMetaContent(html, 'og:description') ||
        extractMetaContent(html, 'twitter:description') ||
        extractMetaContent(html, 'description') ||
        '',
    );

    const siteName = fixEncoding(
      extractMetaContent(html, 'og:site_name') || new URL(resolvedUrl).hostname,
    );

    const result = {
      resolvedUrl,
      title,
      description,
      imageUrl: media.imageUrl,
      hasVideo: media.hasVideo,
      siteName,
    };

    console.log('[parse-link] Parsed successfully:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[parse-link] Error:', error);
    return new Response(JSON.stringify({ error: message, stage: 'parse-link' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
