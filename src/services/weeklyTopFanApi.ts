import { logger } from '../lib/logger';
import { getSafeFanLevelKey, isFanLevelKey } from '../lib/fanLevel';
import { supabase } from '../lib/supabase';
import { fetchPollVotes } from './pollService';
import type { FeedWeeklyTopFanData } from '../types/feed';
import type { FanLevelKey } from '../types/fan';
import { getLatestPublishedWeeklyTopFanWeekStart } from '../utils/homeFeed';

type WeeklyTopFanRow = {
  id: string;
  week_start_date: string;
  generated_at: string | null;
  user_id: string;
  fan_level_key: FanLevelKey;
  weekly_score: number;
  reason_type: 'post' | 'comment' | 'activity' | 'checkin';
  reference_post_id: string | null;
  reference_comment_id: string | null;
  title: string;
  subtitle: string;
  body: string;
  cta_label: string;
  is_published: boolean;
  created_at: string;
};

type ReferencedPostRow = {
  id: string;
  text: string | null;
  poll_data?: {
    question?: string;
    options?: { id?: string; text?: string }[];
  } | null;
};

type ReferencedCommentRow = {
  id: string;
  text: string | null;
};

type WeeklyTopFanProfile = {
  display_name: string | null;
  avatar_url: string | null;
  fan_level_key: FanLevelKey | null;
};

const WEEKLY_TOP_FAN_PROFILE_SELECT_ATTEMPTS = [
  'display_name, avatar_url, fan_level_key',
  'display_name, avatar_url',
] as const;
const WEEKLY_TOP_FAN_DEBUG_ENABLED =
  __DEV__ &&
  process.env.EXPO_PUBLIC_WEEKLY_TOP_FAN_DEBUG?.trim().toLowerCase() === 'true';

function logWeeklyTopFanWarning(message: string, details?: unknown): void {
  if (!WEEKLY_TOP_FAN_DEBUG_ENABLED) {
    return;
  }

  logger.warn(message, details);
}

function extractHighlightText(body: string): string {
  const cleaned = body
    .replace(
      /^(Fremhævet for sit opslag|Fremhævet for kommentaren|Valgt på baggrund af sit opslag|Valgt på baggrund af kommentaren|Spotlight på opslaget|Spotlight på kommentaren):\s*/i,
      '',
    )
    .trim()
    .replace(/^["“”«»]+/, '')
    .replace(/["“”«»]+$/, '')
    .trim();

  return cleaned;
}

function extractDisplayNameFromSubtitle(subtitle: string): string | null {
  const cleaned = subtitle.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  const match = cleaned.match(/^(.+?)\s+har\s+/i);
  return match?.[1]?.trim() || null;
}

async function countRows(
  table: 'likes_v2' | 'comments_v2' | 'poll_votes',
  filters: [string, string | number | boolean][],
): Promise<number | null> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });

  filters.forEach(([column, value]) => {
    query = query.eq(column, value);
  });

  const { count, error } = await query;

  if (error) {
    logWeeklyTopFanWarning(`[weeklyTopFanApi] countRows failed for ${table}:`, error);
    return null;
  }

  return count ?? 0;
}

async function fetchWeeklyTopFanProfile(userId: string): Promise<WeeklyTopFanProfile | null> {
  for (const select of WEEKLY_TOP_FAN_PROFILE_SELECT_ATTEMPTS) {
    const { data, error } = await supabase
      .from('profiles')
      .select(select as string)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logWeeklyTopFanWarning('[weeklyTopFanApi] profile lookup failed for select:', {
        select,
        error,
      });
      continue;
    }

    if (!data) {
      return null;
    }

    const profile = data as {
      display_name?: string | null;
      avatar_url?: string | null;
      fan_level_key?: unknown;
    };

    return {
      display_name: profile.display_name ?? null,
      avatar_url: profile.avatar_url ?? null,
      fan_level_key:
        'fan_level_key' in profile && isFanLevelKey(profile.fan_level_key)
          ? profile.fan_level_key
          : null,
    };
  }

  return null;
}

export async function fetchLatestPublishedWeeklyTopFan(
  baseDate = new Date(),
): Promise<FeedWeeklyTopFanData | null> {
  const expectedWeekStart = getLatestPublishedWeeklyTopFanWeekStart(baseDate);

  if (WEEKLY_TOP_FAN_DEBUG_ENABLED) {
    console.log('[weeklyTopFanApi] fetching published weekly_top_fan row for expected week', {
      expectedWeekStart,
    });
  }

  const { data, error } = await supabase
    .from('weekly_top_fan')
    .select(
      `
      id,
      week_start_date,
      generated_at,
      user_id,
      fan_level_key,
      weekly_score,
      reason_type,
      reference_post_id,
      reference_comment_id,
      title,
      subtitle,
      body,
      cta_label,
      is_published,
      created_at
    `,
    )
    .eq('is_published', true)
    .eq('week_start_date', expectedWeekStart)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logWeeklyTopFanWarning('[weeklyTopFanApi] fetchLatestPublishedWeeklyTopFan failed:', error);
    if (WEEKLY_TOP_FAN_DEBUG_ENABLED) {
      console.log('[weeklyTopFanApi] fetch failed', {
        message: error.message,
        name: error.name,
      });
    }
    return null;
  }

  const row = data as WeeklyTopFanRow | null;
  if (!row) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('weekly_top_fan')
      .select('id, week_start_date, generated_at, created_at')
      .eq('is_published', true)
      .order('week_start_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      logWeeklyTopFanWarning(
        '[weeklyTopFanApi] fallback latest published weekly_top_fan lookup failed:',
        fallbackError,
      );
    }

    const fallbackRow = (fallbackData as Pick<
      WeeklyTopFanRow,
      'id' | 'week_start_date' | 'generated_at' | 'created_at'
    > | null) || null;

    if (WEEKLY_TOP_FAN_DEBUG_ENABLED) {
      console.log('[weeklyTopFanApi] no published weekly_top_fan row found for expected week', {
        expectedWeekStart,
        latestAvailableWeekStart: fallbackRow?.week_start_date ?? null,
        latestAvailableId: fallbackRow?.id ?? null,
        latestAvailableGeneratedAt: fallbackRow?.generated_at ?? null,
        latestAvailableCreatedAt: fallbackRow?.created_at ?? null,
      });
    }
    return null;
  }

  if (WEEKLY_TOP_FAN_DEBUG_ENABLED) {
    console.log('[weeklyTopFanApi] expected published row', {
      id: row.id,
      weekStartDate: row.week_start_date,
      expectedWeekStart,
      userId: row.user_id,
      createdAt: row.created_at,
      generatedAt: row.generated_at,
    });
  }

  const profile = await fetchWeeklyTopFanProfile(row.user_id);
  let contentTypeLabel: string | null = null;
  let highlightText: string | null = extractHighlightText(row.body) || null;
  let likesCount: number | null = null;
  let commentsCount: number | null = null;
  let votesCount: number | null = null;

  try {
    if (row.reference_post_id) {
      const [{ data: postData, error: postError }, postLikesCount, postCommentsCount] =
        await Promise.all([
          supabase
            .from('posts')
            .select('id, text, poll_data')
            .eq('id', row.reference_post_id)
            .maybeSingle(),
          countRows('likes_v2', [
            ['target_type', 'post'],
            ['target_id', row.reference_post_id],
          ]),
          countRows('comments_v2', [
            ['target_type', 'post'],
            ['target_id', row.reference_post_id],
          ]),
        ]);

      if (postError) {
        logWeeklyTopFanWarning('[weeklyTopFanApi] referenced post lookup failed:', postError);
      }

      const post = (postData as ReferencedPostRow | null) || null;
      const isPoll = Boolean(post?.poll_data?.question?.trim());

      contentTypeLabel = isPoll ? '📊 Afstemning' : '📝 Opslag';
      highlightText =
        (isPoll ? post?.poll_data?.question?.trim() : post?.text?.trim()) || highlightText;
      likesCount = postLikesCount;
      commentsCount = postCommentsCount;

      if (isPoll) {
        const pollVotes = await fetchPollVotes([row.reference_post_id]);
        votesCount = Object.values(pollVotes[row.reference_post_id]?.optionVotes || {}).reduce(
          (sum, value) => sum + Math.max(0, value || 0),
          0,
        );
      }
    } else if (row.reference_comment_id) {
      const [{ data: commentData, error: commentError }, commentLikesCount, replyCount] =
        await Promise.all([
          supabase
            .from('comments_v2')
            .select('id, text')
            .eq('id', row.reference_comment_id)
            .maybeSingle(),
          countRows('likes_v2', [
            ['target_type', 'comment'],
            ['target_id', row.reference_comment_id],
          ]),
          countRows('comments_v2', [['parent_id', row.reference_comment_id]]),
        ]);

      if (commentError) {
        logWeeklyTopFanWarning(
          '[weeklyTopFanApi] referenced comment lookup failed:',
          commentError,
        );
      }

      const comment = (commentData as ReferencedCommentRow | null) || null;
      contentTypeLabel = '💬 Kommentar';
      highlightText = comment?.text?.trim() || highlightText;
      likesCount = commentLikesCount;
      commentsCount = replyCount;
    }
  } catch (enrichmentError) {
    logWeeklyTopFanWarning(
      '[weeklyTopFanApi] failed to enrich weekly_top_fan row:',
      enrichmentError,
    );
    if (WEEKLY_TOP_FAN_DEBUG_ENABLED) {
      console.log('[weeklyTopFanApi] enrichment failed, using snapshot fallback', {
        id: row.id,
        weekStartDate: row.week_start_date,
      });
    }
  }

  const item: FeedWeeklyTopFanData = {
    id: row.id,
    weekStartDate: row.week_start_date,
    generatedAt: row.generated_at,
    userId: row.user_id,
    displayName:
      profile?.display_name?.trim() || extractDisplayNameFromSubtitle(row.subtitle) || 'Fan',
    avatarUrl: profile?.avatar_url ?? null,
    fanLevelKey: profile?.fan_level_key ?? getSafeFanLevelKey(row.fan_level_key),
    weeklyScore: row.weekly_score,
    reasonType: row.reason_type,
    referencePostId: row.reference_post_id,
    referenceCommentId: row.reference_comment_id,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    ctaLabel: row.cta_label,
    isPublished: row.is_published,
    createdAt: row.created_at,
    contentTypeLabel,
    highlightText,
    likesCount,
    commentsCount,
    votesCount,
  };

  if (WEEKLY_TOP_FAN_DEBUG_ENABLED) {
    console.log('[weeklyTopFanApi] mapped weekly_top_fan item', {
      id: item.id,
      weekStartDate: item.weekStartDate,
      userId: item.userId,
      hasAvatar: Boolean(item.avatarUrl),
      hasReferencePost: Boolean(item.referencePostId),
      hasReferenceComment: Boolean(item.referenceCommentId),
    });
  }

  return item;
}
