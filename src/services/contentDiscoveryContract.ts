import type { SupabaseClient } from '@supabase/supabase-js';
export type ContentLane = 'news' | 'radar' | 'podcast';
export type ContentStory = {
  id: string;
  lane: ContentLane;
  title: string;
  summary: string;
  topic: string | null;
  image_url: string | null;
  radar_label:
    | 'social'
    | 'rumor'
    | 'journalist'
    | 'official'
    | 'supporters'
    | null;
  editorial_status: 'developing' | 'confirmed' | 'denied' | 'closed' | null;
  updated_at: string;
  target_type: 'news' | 'post';
  target_id: string;
  social_targets: { type: 'news' | 'post'; id: string }[];
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  sources: {
    id: string;
    name: string;
    title: string;
    url: string;
    published_at: string | null;
    podcast_name: string | null;
    chapters: { title: string; startTime: string }[] | null;
  }[];
};
export const laneLabels: Record<ContentLane, string> = {
  news: 'Nyheder',
  radar: 'FCN Radar',
  podcast: 'Podcasts',
};
export function trustLabel(story: Pick<ContentStory, 'lane' | 'radar_label'>) {
  if (story.lane !== 'radar') return laneLabels[story.lane];
  return {
    social: 'Social omtale',
    rumor: 'Rygte — ikke bekræftet',
    journalist: 'Journalist — social omtale',
    official: 'Officiel konto — social omtale',
    supporters: 'Supportersnak',
  }[story.radar_label ?? 'social'];
}
export const statusLabels = {
  developing: 'Under udvikling',
  confirmed: 'Redaktionelt bekræftet',
  denied: 'Redaktionelt afvist',
  closed: 'Afsluttet',
};
export const discoveryMissing = (error: { code?: string } | null) =>
  !!error && ['PGRST202', '42883'].includes(error.code ?? '');
export async function publishedStories(
  client: SupabaseClient,
  lane: ContentLane | null = null,
  id: string | null = null,
): Promise<ContentStory[]> {
  const { data, error } = await client.rpc('get_content_stories', {
    p_lane: lane,
    p_id: id,
  });
  if (discoveryMissing(error)) return [];
  if (error) throw error;
  return data ?? [];
}
export async function resolveStory(
  client: SupabaseClient,
  type: string,
  id: string,
): Promise<ContentStory | null> {
  if (!['news', 'post'].includes(type)) return null;
  const { data, error } = await client.rpc('resolve_content_story', {
    p_type: type,
    p_id: id,
  });
  if (discoveryMissing(error)) return null;
  if (error) throw error;
  // Missing row may be represented as null or an empty result by older adapters.
  if (Array.isArray(data) && data.length === 0) return null;
  if (data && (typeof data.id!=='string' || !['news','post'].includes(data.target_type) || typeof data.target_id!=='string' || !Array.isArray(data.sources) || !Array.isArray(data.social_targets)))throw Error('Invalid content story response');
  return data ?? null;
}
export async function storyTargets(
  client: SupabaseClient,
  type: string,
  ids: readonly string[],
): Promise<Record<string, ContentStory>> {
  if (!['news', 'post'].includes(type) || !ids.length) return {};
  const { data, error } = await client.rpc('resolve_content_story_targets', {
    p_type: type,
    p_ids: [...ids].slice(0, 100),
  });
  if (discoveryMissing(error)) return {};
  if (error) throw error;
  if (Array.isArray(data) && data.length === 0) return {};
  if(data && (typeof data!=='object' || Array.isArray(data)))throw Error('Invalid story target mapping');
  return data ?? {};
}
