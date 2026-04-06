import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

type FanLevelKey =
  | 'new_fan'
  | 'community_member'
  | 'regular_voice'
  | 'community_core'
  | 'dedicated'
  | 'top_fan';

type SyncFanLevelsRequest = {
  job_name?: 'sync_fan_levels';
};

type ProfileRow = {
  id: string;
  fan_level_key: FanLevelKey | null;
};

type PostRow = {
  id: string;
  author_id: string | null;
};

type CommentRow = {
  id: string;
  author_id: string | null;
};

type LikeRow = {
  target_type: 'post' | 'comment';
  target_id: string;
};

type MatchCheckInRow = {
  user_id: string | null;
};

type QueryFailure = {
  code?: string;
  message?: string;
};

const POST_SCORE = 5;
const COMMENT_SCORE = 3;
const LIKE_RECEIVED_SCORE = 1;
const CHECKIN_SCORE = 5;

const FAN_LEVEL_THRESHOLDS: { minScore: number; level: FanLevelKey }[] = [
  { minScore: 1200, level: 'top_fan' },
  { minScore: 800, level: 'dedicated' },
  { minScore: 500, level: 'community_core' },
  { minScore: 250, level: 'regular_voice' },
  { minScore: 100, level: 'community_member' },
  { minScore: 0, level: 'new_fan' },
];

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isFanLevelKey(value: unknown): value is FanLevelKey {
  return (
    value === 'new_fan' ||
    value === 'community_member' ||
    value === 'regular_voice' ||
    value === 'community_core' ||
    value === 'dedicated' ||
    value === 'top_fan'
  );
}

function getFanLevelForScore(score: number): FanLevelKey {
  const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  return FAN_LEVEL_THRESHOLDS.find((threshold) => normalizedScore >= threshold.minScore)?.level || 'new_fan';
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

async function loadCommentRows(
  adminClient: ReturnType<typeof createClient>,
): Promise<{ data: CommentRow[] | null; error: QueryFailure | null }> {
  const commentsV2Response = await adminClient.from('comments_v2').select('id, author_id');

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

  const commentsResponse = await adminClient.from('comments').select('id, author_id');

  return {
    data: (commentsResponse.data || []) as CommentRow[],
    error: commentsResponse.error,
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

    const [profilesResponse, postsResponse, commentsResponse, likesResponse, checkinsResponse] =
      await Promise.all([
        adminClient.from('profiles').select('id, fan_level_key'),
        adminClient.from('posts').select('id, author_id'),
        loadCommentRows(adminClient),
        adminClient
          .from('likes_v2')
          .select('target_type, target_id')
          .in('target_type', ['post', 'comment']),
        adminClient.from('match_checkins').select('user_id'),
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

    const profiles = (profilesResponse.data || []) as ProfileRow[];
    const posts = (postsResponse.data || []) as PostRow[];
    const comments = (commentsResponse.data || []) as CommentRow[];
    const likes = (likesResponse.data || []) as LikeRow[];
    const checkins = (checkinsResponse.data || []) as MatchCheckInRow[];

    const profileIds = new Set(profiles.map((profile) => profile.id));
    const postAuthorById = new Map<string, string>();
    const commentAuthorById = new Map<string, string>();
    const scores = new Map<string, number>();
    const activityUsersWithoutProfile = new Set<string>();

    profiles.forEach((profile) => {
      scores.set(profile.id, 0);
    });

    const addScore = (userId: string | null | undefined, value: number) => {
      if (!userId) return;

      if (!profileIds.has(userId)) {
        activityUsersWithoutProfile.add(userId);
        return;
      }

      scores.set(userId, (scores.get(userId) || 0) + value);
    };

    posts.forEach((post) => {
      if (post.id && post.author_id) {
        postAuthorById.set(post.id, post.author_id);
      }
      addScore(post.author_id, POST_SCORE);
    });

    comments.forEach((comment) => {
      if (comment.id && comment.author_id) {
        commentAuthorById.set(comment.id, comment.author_id);
      }
      addScore(comment.author_id, COMMENT_SCORE);
    });

    likes.forEach((like) => {
      const targetAuthorId =
        like.target_type === 'post'
          ? postAuthorById.get(like.target_id)
          : commentAuthorById.get(like.target_id);

      addScore(targetAuthorId || null, LIKE_RECEIVED_SCORE);
    });

    checkins.forEach((checkin) => {
      addScore(checkin.user_id, CHECKIN_SCORE);
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
        match_checkins: CHECKIN_SCORE,
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
