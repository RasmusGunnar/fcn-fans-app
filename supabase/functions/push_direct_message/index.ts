// deno-lint-ignore-file no-explicit-any
import {
  createAdminClient,
  fetchPushPreferencesByUserIds,
  isPushPreferenceEnabled,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type DirectMessagePushRequest = {
  messageId?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function readBody(req: Request): Promise<DirectMessagePushRequest> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as DirectMessagePushRequest)
      : {};
  } catch {
    return {};
  }
}

async function processQueuedJob(jobId: string) {
  const supabaseUrl = readString(Deno.env.get('SUPABASE_URL'));
  const syncSecret = readString(Deno.env.get('SYNC_SECRET'));
  if (!supabaseUrl || !syncSecret) {
    throw new Error('Missing SUPABASE_URL or SYNC_SECRET');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/process_push_queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': syncSecret,
    },
    body: JSON.stringify({ jobId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error(`process_push_queue failed with status ${response.status}`);
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const { user, response: authError } = await requireAuthenticatedUser(req);
  if (authError) return authError;
  if (!user) return json(401, { error: 'Unauthorized' });

  const request = await readBody(req);
  const messageId = readUuid(request.messageId);
  const senderId = readUuid(user.id);
  if (!messageId || !senderId) {
    return json(400, { error: 'Valid messageId is required' });
  }

  try {
    const supabase = createAdminClient();
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id')
      .eq('id', messageId)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message || message.sender_id !== senderId) {
      return json(404, { error: 'Message not found' });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('user_low_id, user_high_id')
      .eq('id', message.conversation_id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (
      !conversation ||
      ![conversation.user_low_id, conversation.user_high_id].includes(senderId)
    ) {
      return json(404, { error: 'Conversation not found' });
    }

    const recipientId =
      conversation.user_low_id === senderId ? conversation.user_high_id : conversation.user_low_id;
    if (!recipientId || recipientId === senderId) {
      return json(400, { error: 'Invalid recipient' });
    }

    const { data: blockRows, error: blockError } = await supabase
      .from('user_blocks')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${senderId},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${senderId})`,
      )
      .limit(1);
    if (blockError) throw blockError;

    const preferencesByUserId = await fetchPushPreferencesByUserIds(supabase, [recipientId]);
    const preferenceEnabled = isPushPreferenceEnabled(
      preferencesByUserId,
      recipientId,
      'direct_messages',
    );

    const { data: job, error: jobError } = await supabase
      .from('notification_jobs')
      .select('id, status')
      .eq('notification_type', 'direct_message')
      .eq('source_table', 'messages')
      .eq('source_id', messageId)
      .maybeSingle();
    if (jobError) throw jobError;

    const skipReason =
      (blockRows ?? []).length > 0
        ? 'direct_message_blocked'
        : !preferenceEnabled
          ? 'preference_disabled'
          : null;

    if (skipReason) {
      if (job?.id && job.status === 'queued') {
        const { error: skipError } = await supabase
          .from('notification_jobs')
          .update({ status: 'skipped', skip_reason: skipReason })
          .eq('id', job.id)
          .eq('status', 'queued');
        if (skipError) throw skipError;
      }

      return json(200, { ok: true, inserted: false, skipped: skipReason });
    }

    if (!job?.id) {
      return json(409, { error: 'Direct message outbox job not found' });
    }

    if (job.status !== 'queued') {
      return json(200, {
        ok: true,
        jobId: job.id,
        inserted: false,
        skipped: 'already_processed',
      });
    }

    try {
      const process = await processQueuedJob(job.id);
      return json(200, { ok: true, jobId: job.id, inserted: true, process });
    } catch (processError) {
      console.warn('[push_direct_message] queue processing failed after durable enqueue', {
        jobId: job.id,
        error: String(processError),
      });
      return json(200, {
        ok: true,
        jobId: job.id,
        inserted: true,
        processDeferred: true,
      });
    }
  } catch (error) {
    console.error('[push_direct_message] failed', {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return json(500, { error: 'Could not process direct message push' });
  }
});
