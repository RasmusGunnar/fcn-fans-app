import { parseInstagramUrl } from '../lib/instagram';
import { supabase } from '../lib/supabase';
import type { InstagramEmbedResponse } from '../types/instagramEmbed';
import type { SharedLinkAttachment } from '../types/externalShare';
import { isRichInstagramUrl, validateInstagramEmbedResponse } from '../utils/instagramEmbed';

type MemoryEntry = { value: InstagramEmbedResponse; expiresAt: number };
const memoryCache = new Map<string, MemoryEntry>();
const inflight = new Map<string, Promise<InstagramEmbedResponse>>();

function getResponseExpiry(response: InstagramEmbedResponse): number {
  const raw = response.status === 'ready' ? response.expiresAt : response.retryAfter;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function fetchInstagramEmbed(
  attachment: Pick<SharedLinkAttachment, 'canonicalUrl'>,
): Promise<InstagramEmbedResponse> {
  const parsed = parseInstagramUrl(attachment.canonicalUrl);
  if (
    !parsed ||
    parsed.canonicalUrl !== attachment.canonicalUrl ||
    !isRichInstagramUrl(parsed.canonicalUrl)
  ) {
    throw new Error('unsupported_instagram_embed');
  }

  const cached = memoryCache.get(parsed.canonicalUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inflight.get(parsed.canonicalUrl);
  if (pending) return pending;

  const request = (async () => {
    const { data, error } = await supabase.functions.invoke('instagram_oembed', {
      body: { url: parsed.canonicalUrl },
    });
    if (error) throw new Error('instagram_embed_request_failed');
    const response = validateInstagramEmbedResponse(data, parsed.canonicalUrl);
    if (!response) throw new Error('instagram_embed_invalid_response');
    memoryCache.set(parsed.canonicalUrl, {
      value: response,
      expiresAt: getResponseExpiry(response),
    });
    return response;
  })();
  inflight.set(parsed.canonicalUrl, request);
  try {
    return await request;
  } finally {
    inflight.delete(parsed.canonicalUrl);
  }
}

export function clearInstagramEmbedMemoryCache(): void {
  memoryCache.clear();
  inflight.clear();
}
