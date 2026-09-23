/** Additive public metadata. Social identity always remains news_items.id. */
export type NewsFormat = 'article' | 'social' | 'podcast' | 'video';
export type NewsMetadata = {
  format: NewsFormat;
  originalSource: string;
  provider?: string;
  account?: string | null;
  platform?: string | null;
  program?: string | null;
  mediaUrl?: string | null;
  durationSeconds?: number | null;
  originalText?: string;
  translation?: {
    text: string;
    language: string;
    machineGenerated: true;
  } | null;
  summaryOrigin?: 'original' | 'provider_ai' | 'own_ai' | 'editor' | 'none';
  textBasis?: 'article_text' | 'description' | 'social_text' | 'metadata_only';
  affiliation?: 'first_team' | 'women' | 'academy' | 'former_players' | 'club';
  topic?: string;
  withdrawn?: boolean;
  alternatives?: { name: string; url: string }[];
};
export const newsFormatLabels: Record<NewsFormat, string> = {
  article: 'Nyheder',
  social: 'Sociale medier',
  podcast: 'Podcasts',
  video: 'Video',
};
export function newsMetadata(value: unknown): NewsMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as NewsMetadata;
  return ['article', 'social', 'podcast', 'video'].includes(row.format) ? row : undefined;
}
export function safeMediaLink(value: string | null | undefined) {
  try {
    const u = new URL(value ?? '');
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
export function newsAction(meta?: NewsMetadata) {
  return meta?.format === 'podcast'
    ? 'Lyt til episoden'
    : meta?.format === 'video'
      ? 'Se videoen'
      : meta?.format === 'social'
        ? 'Se originalt opslag'
        : 'Læs originalen';
}
/** Keep social bursts out of the first screen without deleting or cloning items. */
export function balanceNews<T>(items: T[], format: (item: T) => string) {
  const result: T[] = [],
    deferred: T[] = [];
  let social = 0;
  for (const item of items) {
    if (format(item) === 'social' && social >= 2 && result.length < 10) deferred.push(item);
    else {
      result.push(item);
      if (format(item) === 'social') social++;
    }
  }
  if (!deferred.length) return items;
  return [...result.slice(0, 10), ...deferred, ...result.slice(10)];
}
