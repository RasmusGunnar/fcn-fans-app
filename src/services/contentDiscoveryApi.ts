import { supabase } from '../lib/supabase';
import {
  publishedStories,
  resolveStory,
  storyTargets,
  type ContentLane,
} from './contentDiscoveryContract';
export * from './contentDiscoveryContract';
export const fetchContentStories = (
  lane: ContentLane | null = null,
  id: string | null = null,
) => publishedStories(supabase, lane, id);
export const resolveContentStory = (type: string, id: string) =>
  resolveStory(supabase, type, id);
export const contentStoryTargets = (type: string, ids: string[]) =>
  storyTargets(supabase, type, ids);
export async function fetchContentComments(
  type: string,
  id: string,
  latestFirst = false,
) {
  const story = await resolveContentStory(type, id);
  if (story) {
    const result = await supabase.rpc('get_content_story_comments', {
      p_story: story.id,
    });
    return {
      ...result,
      data: latestFirst ? [...(result.data ?? [])].reverse() : result.data,
    };
  }
  return supabase
    .from('comments_v2')
    .select('id, created_at, author_id, text, parent_id')
    .eq('target_type', type)
    .eq('target_id', id)
    .order('created_at', { ascending: !latestFirst })
    .order('id', { ascending: !latestFirst });
}
export async function insertContentComment(input: {
  target_type: string;
  target_id: string;
  author_id: string;
  text: string;
  parent_id?: string;
}) {
  const story = await resolveContentStory(input.target_type, input.target_id);
  if (story) {
    const created = await supabase.rpc('create_content_story_comment', {
      p_story: story.id,
      p_text: input.text,
      p_parent: input.parent_id ?? null,
    });
    if (created.error) return { data: null, error: created.error };
    return supabase
      .from('comments_v2')
      .select('id, created_at, author_id, text, parent_id')
      .eq('id', created.data)
      .single();
  }
  return supabase
    .from('comments_v2')
    .insert(input)
    .select('id, created_at, author_id, text, parent_id')
    .single();
}
