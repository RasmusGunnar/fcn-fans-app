// deno-lint-ignore-file no-explicit-any
import {
  createAdminClient,
  dispatchNotifications,
  fetchPushTokensForUsers,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type Payload = {
  toUserId?: string;
  pushToken?: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  notificationType?: string;
  dedupeKey?: string;
};

Deno.serve(async (req) => {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.response) {
      return auth.response;
    }

    const callerUserId = auth.user.id as string;
    const payload: Payload = await req.json();
    const targetUserId = payload?.toUserId ?? callerUserId;
    const title = payload?.title?.trim() ?? '';
    const body = payload?.body?.trim() ?? '';

    if (targetUserId !== callerUserId) {
      return json(403, { error: 'send-push only supports self-test for the authenticated user' });
    }

    if (!title || !body) {
      return json(400, { error: 'missing title or body' });
    }

    const supabase = createAdminClient();
    const pushToken = payload.pushToken?.trim() || null;
    let tokens: any[] = [];
    let matchedRequestedToken = false;

    if (pushToken) {
      const { data, error } = await supabase
        .from('push_tokens')
        .select('user_id, push_token, platform')
        .eq('user_id', callerUserId)
        .eq('push_token', pushToken);

      if (error) {
        throw error;
      }

      tokens = Array.isArray(data) ? data : [];
      matchedRequestedToken = tokens.length > 0;
    } else {
      tokens = await fetchPushTokensForUsers(supabase, [callerUserId]);
      matchedRequestedToken = true;
    }

    if (pushToken && tokens.length === 0) {
      tokens = await fetchPushTokensForUsers(supabase, [callerUserId]);
    }

    if (tokens.length === 0) {
      return json(200, { ok: true, skipped: 'no token' });
    }

    const result = await dispatchNotifications(
      supabase,
      tokens.map((tokenRow: any) => ({
        userId: tokenRow.user_id as string,
        pushToken: tokenRow.push_token as string,
        notificationType: payload.notificationType ?? 'manual_test',
        dedupeKey:
          payload.dedupeKey ??
          `manual_test:${callerUserId}:${tokenRow.push_token}:${title}:${body}`,
        title,
        body,
        data: payload.data ?? {},
      })),
    );

    return json(200, {
      ok: true,
      matchedRequestedToken,
      requestedPushToken: pushToken,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
