// Supabase Edge Function: parse-link
// Parses URL and extracts OpenGraph/Twitter Card metadata for link previews
// Deploy with: supabase functions deploy parse-link

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  extractArticleMetadata,
  fetchArticleMedia,
  isWeakArticleDescription,
  isWeakArticleTitle,
} from '../_shared/newsMedia.ts';
import { fixEncoding } from '../_shared/textEncoding.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const FETCH_TIMEOUT_MS = 5000;
const USER_AGENT = 'fcn-fans-parse-link/1.0';
const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

type PreviewProvider = 'youtube' | 'instagram' | 'facebook' | 'generic';

function getPreviewProvider(url: string): PreviewProvider {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();

    if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
      return 'youtube';
    }

    if (hostname.includes('instagram.com')) {
      return 'instagram';
    }

    if (hostname.includes('facebook.com') || hostname === 'fb.watch') {
      return 'facebook';
    }
  } catch {
    // Fall through to generic
  }

  return 'generic';
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

    if (hostname === 'youtu.be') {
      const candidate = pathSegments[0] ?? '';
      return YOUTUBE_VIDEO_ID_REGEX.test(candidate) ? candidate : null;
    }

    if (!hostname.includes('youtube.com')) {
      return null;
    }

    if (parsedUrl.pathname === '/watch') {
      const candidate = parsedUrl.searchParams.get('v') ?? '';
      return YOUTUBE_VIDEO_ID_REGEX.test(candidate) ? candidate : null;
    }

    if (pathSegments.length >= 2) {
      const [, secondSegment] = pathSegments;
      return YOUTUBE_VIDEO_ID_REGEX.test(secondSegment) ? secondSegment : null;
    }
  } catch {
    // Ignore malformed URLs
  }

  return null;
}

function buildFallbackPreview(url: string, resolvedUrl: string) {
  let parsedUrl: URL | null = null;

  try {
    parsedUrl = new URL(resolvedUrl);
  } catch {
    try {
      parsedUrl = new URL(url);
      resolvedUrl = parsedUrl.toString();
    } catch {
      parsedUrl = null;
    }
  }

  const provider = getPreviewProvider(resolvedUrl);
  const hostname = parsedUrl?.hostname.replace(/^www\./i, '') || 'link';
  let title = hostname;
  let siteName = hostname;
  let imageUrl: string | null = null;
  let hasVideo = false;

  if (provider === 'youtube') {
    const videoId = extractYouTubeVideoId(resolvedUrl);
    title = 'YouTube-video';
    siteName = 'YouTube';
    hasVideo = true;
    imageUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  } else if (provider === 'instagram') {
    const path = parsedUrl?.pathname.toLowerCase() || '';
    hasVideo = path.includes('/reel/') || path.includes('/reels/') || path.includes('/tv/');
    title = hasVideo ? 'Instagram reel' : 'Instagram-opslag';
    siteName = 'Instagram';
  } else if (provider === 'facebook') {
    title = 'Facebook-link';
    siteName = 'Facebook';
  }

  return {
    resolvedUrl,
    title,
    description: '',
    imageUrl,
    hasVideo,
    siteName,
  };
}

function isLikelyFacebookInterstitial(
  html: string,
  resolvedUrl: string,
  metadata: { title: string; description: string; media: { imageUrl: string | null } },
): boolean {
  const lowerHtml = html.toLowerCase();
  const titleWeak = isWeakArticleTitle(metadata.title, resolvedUrl, ['Facebook']);
  const descriptionWeak = isWeakArticleDescription(metadata.description, metadata.title);
  const looksLikeLoginShell =
    lowerHtml.includes('log into facebook') ||
    lowerHtml.includes('log in to facebook') ||
    lowerHtml.includes('log ind på facebook') ||
    lowerHtml.includes('facebook helps you connect and share');

  return looksLikeLoginShell || (titleWeak && descriptionWeak && !metadata.media.imageUrl);
}

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
      return new Response(JSON.stringify(buildFallbackPreview(url, resolvedUrl)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[parse-link] HTML fetched, parsing meta tags...');

    const provider = getPreviewProvider(resolvedUrl);
    const metadata = extractArticleMetadata(html, resolvedUrl);

    if (provider === 'facebook' && isLikelyFacebookInterstitial(html, resolvedUrl, metadata)) {
      return new Response(JSON.stringify(buildFallbackPreview(url, resolvedUrl)), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const title = fixEncoding(metadata.title || 'Ingen titel');
    const description = fixEncoding(metadata.description || '');
    const siteName = fixEncoding(
      metadata.siteName || new URL(resolvedUrl).hostname.replace(/^www\./i, ''),
    );

    const result = {
      resolvedUrl,
      title,
      description,
      imageUrl: metadata.media.imageUrl ?? media.imageUrl,
      hasVideo: metadata.media.hasVideo || media.hasVideo,
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
