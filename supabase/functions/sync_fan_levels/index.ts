import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  AWAY_CHECKIN_SCORE,
  COMMENT_SCORE,
  FAN_LEVEL_THRESHOLDS,
  HOME_CHECKIN_SCORE,
  LIKE_RECEIVED_SCORE,
  POST_SCORE,
  calculateFanLevelScores,
  getFanLevelForScore,
  isFanLevelKey,
  type CommentRow,
  type FanLevelKey,
  type FixtureRow,
  type LikeRow,
  type MatchCheckInRow,
  type PostRow,
  type ProfileRow,
} from '../_shared/fanLevelScoring.ts';

type SyncFanLevelsRequest = {
  job_name?: 'sync_fan_levels';
};

type QueryFailure = {
  code?: string;
  message?: string;
};

type SupabaseQueryBuilder<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: QueryFailure | null }>;
};

const PAGE_SIZE = 1000;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isMissingRelation(error: QueryFailure | null | undefined): boolean {
  const message = error?.message?.toLowerCase() || '';
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
}

async function readRequest(req: Request): Promise<SyncFanLevelsRequest | null> {
  try {
    return (await req.json()) as SyncFanLevelsRequest;
  } catch {
    return null;
  }
}

async function loadAllRows<T>(
  createQuery: () => SupabaseQueryBuilder<T>,
): Promise<{ data: T[] | null; error: QueryFailure | null }> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await createQuery().range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const page = data || [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
}

async function loadCommentRows(
  adminClient: ReturnType<typeof createClient>,
): Promise<{ data: CommentRow[] | null; error: QueryFailure | null }> {
  const commentsV2Response = await loadAllRows<CommentRow>(() =>
    adminClient.from('comments_v2').select('id, author_id, target_type, target_id, created_at'),
  );

  if (!commentsV2Response.error) {
    return {
      data: (commentsV2Response.data || []) as CommentRow[],
      error: null,
    };
  }

  if (!isMissingRelation(commentsV2Response.error)) {
    return {
      data: null,
      error: commentsV2Response.error,
    };
  }

  const commentsResponse = await loadAllRows<{
    id: string;
    author_id: string | null;
    post_id: string;
    created_at: string;
  }>(() => adminClient.from('comments').select('id, author_id, post_id, created_at'));

  if (commentsResponse.error) {
    return {
      data: null,
      error: commentsResponse.error,
    };
  }

  return {
    data: (commentsResponse.data || []).map((comment) => ({
      id: comment.id,
      author_id: comment.author_id,
      target_type: 'post',
      target_id: comment.post_id,
      created_at: comment.created_at,
    })),
    error: null,
  };
}

async function upsertProfileLevels(
  adminClient: ReturnType<typeof createClient>,
  rows: { id: string; fan_level_key: FanLevelKey }[],
) {
  const chunkSize = 500;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await adminClient.from('profiles').upsert(chunk, { onConflict: 'id' });

    if (error) {
      return error;
    }
  }

  return null;
}

serve(async (req) => {
  try {
    const syncSecret = Deno.env.get('SYNC_SECRET');
    const providedSecret = req.headers.get('x-sync-secret');

    if (!syncSecret || !providedSecret || providedSecret !== syncSecret) {
      return json(401, { error: 'Unauthorized' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(500, { error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    const requestData = await readRequest(req);

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const [
      profilesResponse,
      postsResponse,
      commentsResponse,
      likesResponse,
      checkinsResponse,
      fixturesResponse,
    ] = await Promise.all([
      loadAllRows<ProfileRow>(() => adminClient.from('profiles').select('id, fan_level_key')),
      loadAllRows<PostRow>(() =>
        adminClient.from('posts').select('id, author_id, created_at, post_type, actor_type'),
      ),
      loadCommentRows(adminClient),
      loadAllRows<LikeRow>(() =>
        adminClient
          .from('likes_v2')
          .select('user_id, target_type, target_id, created_at')
          .in('target_type', ['post', 'comment']),
      ),
      loadAllRows<MatchCheckInRow>(() =>
        adminClient.from('match_checkins').select('match_id, user_id, created_at'),
      ),
      loadAllRows<FixtureRow>(() =>
        adminClient.from('fixtures').select('id, home_team, away_team'),
      ),
    ]);

    if (profilesResponse.error) {
      return json(500, {
        error: 'Failed to load profiles',
        details: profilesResponse.error.message,
      });
    }

    if (postsResponse.error) {
      return json(500, {
        error: 'Failed to load posts',
        details: postsResponse.error.message,
      });
    }

    if (commentsResponse.error) {
      return json(500, {
        error: 'Failed to load comments',
        details: commentsResponse.error.message,
      });
    }

    if (likesResponse.error) {
      return json(500, {
        error: 'Failed to load likes',
        details: likesResponse.error.message,
      });
    }

    if (checkinsResponse.error) {
      return json(500, {
        error: 'Failed to load match check-ins',
        details: checkinsResponse.error.message,
      });
    }
    if (fixturesResponse.error) {
      return json(500, {
        error: 'Failed to load fixtures',
        details: fixturesResponse.error.message,
      });
    }

    const profiles = (profilesResponse.data || []) as ProfileRow[];
    const posts = (postsResponse.data || []) as PostRow[];
    const comments = (commentsResponse.data || []) as CommentRow[];
    const likes = (likesResponse.data || []) as LikeRow[];
    const checkins = (checkinsResponse.data || []) as MatchCheckInRow[];
    const fixtures = (fixturesResponse.data || []) as FixtureRow[];

    const { scores, activityUsersWithoutProfile } = calculateFanLevelScores({
      profiles,
      posts,
      comments,
      likes,
      checkins,
      fixtures,
    });

    const updates: { id: string; fan_level_key: FanLevelKey }[] = [];
    const sampleResults = profiles
      .map((profile) => {
        const score = scores.get(profile.id) || 0;
        const nextLevel = getFanLevelForScore(score);
        const currentLevel = isFanLevelKey(profile.fan_level_key) ? profile.fan_level_key : null;

        if (currentLevel !== nextLevel) {
          updates.push({ id: profile.id, fan_level_key: nextLevel });
        }

        return {
          user_id: profile.id,
          score,
          previous_fan_level_key: currentLevel,
          next_fan_level_key: nextLevel,
          updated: currentLevel !== nextLevel,
        };
      })
      .sort((a, b) => b.score - a.score || a.user_id.localeCompare(b.user_id))
      .slice(0, 10);

    const updateError = await upsertProfileLevels(adminClient, updates);

    if (updateError) {
      return json(500, {
        error: 'Failed to update profile fan levels',
        details: updateError.message,
      });
    }

    return json(200, {
      ok: true,
      job_name: requestData?.job_name || 'sync_fan_levels',
      processed_profiles: profiles.length,
      updated_profiles: updates.length,
      unchanged_profiles: profiles.length - updates.length,
      score_weights: {
        posts: POST_SCORE,
        comments: COMMENT_SCORE,
        likes_received: LIKE_RECEIVED_SCORE,
        home_match_checkins: HOME_CHECKIN_SCORE,
        away_match_checkins: AWAY_CHECKIN_SCORE,
      },
      thresholds: FAN_LEVEL_THRESHOLDS.slice().reverse(),
      activity_users_without_profile_count: activityUsersWithoutProfile.size,
      sample_results: sampleResults,
    });
  } catch (error) {
    return json(500, {
      error: 'Internal server error',
      details: String(error),
    });
  }
});
