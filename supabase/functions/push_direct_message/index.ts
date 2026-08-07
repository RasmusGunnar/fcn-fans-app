// deno-lint-ignore-file no-explicit-any
import { createAdminClient, json, requireAuthenticatedUser } from '../_shared/push.ts';

type DirectMessagePushRequest = { messageId?: unknown };

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
    headers: { 'Content-Type': 'application/json', 'x-sync-secret': syncSecret },
    body: JSON.stringify({ jobId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    throw new Error(`process_push_queue failed with status ${response.status}`);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const { user, response: authError } = await requireAuthenticatedUser(req);
  if (authError) return authError;
  if (!user) return json(401, { error: 'Unauthorized' });

  const request = await readBody(req);
  const messageId = readUuid(request.messageId);
  const senderId = readUuid(user.id);
  if (!messageId || !senderId) return json(400, { error: 'Valid messageId is required' });

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

    const { data: senderMembership, error: senderMembershipError } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', message.conversation_id)
      .eq('user_id', senderId)
      .is('left_at', null)
      .is('removed_at', null)
      .maybeSingle();
    if (senderMembershipError) throw senderMembershipError;
    if (!senderMembership) return json(404, { error: 'Conversation not found' });

    const { data: jobs, error: jobError } = await supabase
      .from('notification_jobs')
      .select('id, status, recipient_user_id')
      .eq('notification_type', 'direct_message')
      .eq('source_table', 'messages')
      .eq('source_id', messageId);
    if (jobError) throw jobError;
    if (!jobs?.length) return json(409, { error: 'Message outbox jobs not found' });

    const recipientIds = jobs.map((job: any) => job.recipient_user_id);
    const { data: memberships, error: membershipError } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', message.conversation_id)
      .in('user_id', recipientIds)
      .is('left_at', null)
      .is('removed_at', null);
    if (membershipError) throw membershipError;
    const activeRecipients = new Set((memberships ?? []).map((row: any) => row.user_id));

    const queuedJobs = jobs.filter(
      (job: any) =>
        job.status === 'queued' &&
        job.recipient_user_id !== senderId &&
        activeRecipients.has(job.recipient_user_id),
    );
    const processedJobIds: string[] = [];
    const deferredJobIds: string[] = [];

    for (const job of queuedJobs) {
      try {
        await processQueuedJob(job.id);
        processedJobIds.push(job.id);
      } catch (processError) {
        deferredJobIds.push(job.id);
        console.warn('[push_direct_message] queue processing deferred', {
          jobId: job.id,
          error: String(processError),
        });
      }
    }

    return json(200, {
      ok: true,
      inserted: queuedJobs.length > 0,
      processedJobIds,
      deferredJobIds,
      skipped: queuedJobs.length === 0 ? 'already_processed_or_inactive' : null,
    });
  } catch (error) {
    console.error('[push_direct_message] failed', {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return json(500, { error: 'Could not process message push' });
  }
});
