// deno-lint-ignore-file no-explicit-any
import { createAdminClient, json, requireAuthenticatedUser } from '../_shared/push.ts';

type Payload = {
  pushToken?: string | null;
  previousToken?: string | null;
  platform?: string | null;
};

type PushPlatform = 'ios' | 'android';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readPlatform(value: unknown): PushPlatform | null {
  const normalized = readString(value);
  return normalized === 'ios' || normalized === 'android' ? normalized : null;
}

async function claimPushDevice(params: {
  supabase: any;
  userId: string;
  pushToken: string;
  previousToken: string | null;
  platform: PushPlatform;
}) {
  const nowIso = new Date().toISOString();

  try {
    if (params.previousToken && params.previousToken !== params.pushToken) {
      const { error: invalidatePreviousError } = await params.supabase
        .from('push_devices')
        .update({
          invalidated_at: nowIso,
          invalidated_reason: 'replaced_by_new_token',
          updated_at: nowIso,
        })
        .eq('user_id', params.userId)
        .eq('push_token', params.previousToken)
        .is('invalidated_at', null);

      if (invalidatePreviousError) {
        throw invalidatePreviousError;
      }
    }

    const { error: upsertError } = await params.supabase.from('push_devices').upsert(
      {
        user_id: params.userId,
        push_token: params.pushToken,
        platform: params.platform,
        updated_at: nowIso,
        last_seen_at: nowIso,
        invalidated_at: null,
        invalidated_reason: null,
      },
      { onConflict: 'push_token' },
    );

    if (upsertError) {
      throw upsertError;
    }
  } catch (error) {
    console.warn('[claim_push_token] push_devices dual-write failed', {
      userId: params.userId,
      platform: params.platform,
      error: String(error),
    });
  }
}

Deno.serve(async (req) => {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.response) {
      return auth.response;
    }

    const callerUserId = auth.user.id as string;
    let payload: Payload = {};

    try {
      payload = (await req.json()) as Payload;
    } catch {
      payload = {};
    }

    const pushToken = readString(payload.pushToken);
    const previousToken = readString(payload.previousToken);
    const platform = readPlatform(payload.platform);

    if (!pushToken || !platform) {
      return json(400, { error: 'Missing pushToken or platform' });
    }

    const supabase = createAdminClient();

    if (previousToken && previousToken !== pushToken) {
      const { error: removePreviousError } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', callerUserId)
        .eq('push_token', previousToken);

      if (removePreviousError) {
        throw removePreviousError;
      }
    }

    const { error: deleteExistingError } = await supabase
      .from('push_tokens')
      .delete()
      .eq('push_token', pushToken);

    if (deleteExistingError) {
      throw deleteExistingError;
    }

    const { error: insertError } = await supabase.from('push_tokens').insert({
      user_id: callerUserId,
      push_token: pushToken,
      platform,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      throw insertError;
    }

    await claimPushDevice({
      supabase,
      userId: callerUserId,
      pushToken,
      previousToken,
      platform,
    });

    return json(200, {
      ok: true,
      userId: callerUserId,
      pushToken,
      platform,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
