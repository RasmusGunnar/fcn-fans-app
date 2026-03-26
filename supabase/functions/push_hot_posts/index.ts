// deno-lint-ignore-file no-explicit-any
import { createAdminClient, dispatchNotifications, fetchAllPushTokens, json, requireSyncSecret } from '../_shared/push.ts';

const LOOKBACK_HOURS = 24;
const MIN_LIKES = 8;
const MIN_COMMENTS = 4;
const MAX_POSTS_PER_RUN = 1;

function isHomePost(feedTargets: unknown): boolean {
  if (!Array.isArray(feedTargets)) return true;
  return feedTargets.length === 0 || feedTargets.includes('home');
}

Deno.serve(async (req) => {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

    const { data: posts, error: postError } = await supabase
      .from('posts')
      .select('id, created_at, feed_targets')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(25);

    if (postError) {
      throw postError;
    }

    const homePosts = (posts ?? []).filter((post: any) => isHomePost(post.feed_targets));
    const postIds = homePosts.map((post: any) => String(post.id));
    if (postIds.length === 0) {
      return json(200, { ok: true, postsMatched: 0, total: 0, queued: 0, skipped: 0, sent: 0, failed: 0 });
    }

    const [{ data: likes, error: likesError }, { data: comments, error: commentsError }] =
      await Promise.all([
        supabase
          .from('likes_v2')
          .select('target_id')
          .eq('target_type', 'post')
          .in('target_id', postIds),
        supabase
          .from('comments_v2')
          .select('target_id')
          .eq('target_type', 'post')
          .in('target_id', postIds),
      ]);

    if (likesError) throw likesError;
    if (commentsError) throw commentsError;

    const likeCounts = new Map<string, number>();
    const commentCounts = new Map<string, number>();

    (likes ?? []).forEach((row: any) => {
      const targetId = String(row.target_id);
      likeCounts.set(targetId, (likeCounts.get(targetId) ?? 0) + 1);
    });

    (comments ?? []).forEach((row: any) => {
      const targetId = String(row.target_id);
      commentCounts.set(targetId, (commentCounts.get(targetId) ?? 0) + 1);
    });

    const hotPosts = homePosts
      .map((post: any) => ({
        id: String(post.id),
        likes: likeCounts.get(String(post.id)) ?? 0,
        comments: commentCounts.get(String(post.id)) ?? 0,
      }))
      .filter((post) => post.likes >= MIN_LIKES || post.comments >= MIN_COMMENTS)
      .sort((a, b) => {
        const commentDiff = b.comments - a.comments;
        if (commentDiff !== 0) return commentDiff;
        return b.likes - a.likes;
      })
      .slice(0, MAX_POSTS_PER_RUN);

    const tokens = await fetchAllPushTokens(supabase);
    const requests = hotPosts.flatMap((post) =>
      tokens.map((tokenRow: any) => ({
        userId: tokenRow.user_id as string,
        pushToken: tokenRow.push_token as string,
        notificationType: 'hot_post',
        dedupeKey: `hot_post:${post.id}:${tokenRow.push_token}`,
        title: 'Der er gang i snakken 🔥',
        body: 'Se hvad fans snakker om lige nu',
        data: {
          targetType: 'home_feed',
          notificationType: 'hot_post',
          postId: post.id,
          url: 'fcnfans://home',
        },
      })),
    );

    const result = await dispatchNotifications(supabase, requests);
    return json(200, {
      ok: true,
      postsMatched: hotPosts.length,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
