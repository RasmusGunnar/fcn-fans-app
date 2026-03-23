// deno-lint-ignore-file no-explicit-any
import {
  createAdminClient,
  dispatchNotifications,
  fetchPushTokensForUsers,
  json,
} from '../_shared/push.ts';

type Payload = {
  toUserId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  notificationType?: string;
  dedupeKey?: string;
};

Deno.serve(async (req) => {
  try {
    const payload: Payload = await req.json();
    if (!payload?.toUserId) {
      return json(400, { error: 'missing toUserId' });
    }

    const supabase = createAdminClient();
    const tokens = await fetchPushTokensForUsers(supabase, [payload.toUserId]);
    if (tokens.length === 0) {
      return json(200, { ok: true, skipped: 'no token' });
    }

    const result = await dispatchNotifications(
      supabase,
      tokens.map((tokenRow: any) => ({
        userId: tokenRow.user_id as string,
        pushToken: tokenRow.push_token as string,
        notificationType: payload.notificationType ?? 'manual',
        dedupeKey:
          payload.dedupeKey ??
          `manual:${payload.toUserId}:${tokenRow.push_token}:${payload.title}:${payload.body}`,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
      })),
    );

    return json(200, { ok: true, ...result });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
