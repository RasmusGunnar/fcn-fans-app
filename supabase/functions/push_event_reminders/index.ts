// deno-lint-ignore-file no-explicit-any
import {
  createAdminClient,
  dispatchNotifications,
  fetchAllPushTokens,
  fetchPushTokensForUsers,
  json,
  requireSyncSecret,
} from '../_shared/push.ts';

const LEAD_MINUTES = 180;
const WINDOW_MINUTES = 15;

function formatTimeDa(iso: string): string {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Copenhagen',
  });
}

Deno.serve(async (req) => {
  const authError = requireSyncSecret(req);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() + (LEAD_MINUTES - WINDOW_MINUTES) * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LEAD_MINUTES * 60 * 1000);

    const { data: events, error: eventError } = await supabase
      .from('events')
      .select('id, title, start_at')
      .gt('start_at', windowStart.toISOString())
      .lte('start_at', windowEnd.toISOString())
      .order('start_at', { ascending: true });

    if (eventError) {
      throw eventError;
    }

    const allTokens = await fetchAllPushTokens(supabase);
    const requests: any[] = [];

    for (const event of events ?? []) {
      const { data: rsvps, error: rsvpError } = await supabase
        .from('rsvps')
        .select('user_id')
        .eq('entity_type', 'event')
        .eq('entity_id', event.id)
        .eq('status', 'going');

      if (rsvpError) {
        throw rsvpError;
      }

      const rsvpUserIds = Array.from(
        new Set(
          (rsvps ?? [])
            .map((row: any) => row.user_id as string | null)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const tokens =
        rsvpUserIds.length > 0 ? await fetchPushTokensForUsers(supabase, rsvpUserIds) : allTokens;

      tokens.forEach((tokenRow: any) => {
        requests.push({
          userId: tokenRow.user_id as string,
          pushToken: tokenRow.push_token as string,
          notificationType: 'event_reminder',
          dedupeKey: `event_reminder:${event.id}:${tokenRow.push_token}`,
          title: 'Event starter snart 🎉',
          body: `${event.title} starter kl. ${formatTimeDa(String(event.start_at))}`,
          data: {
            type: 'event',
            eventId: String(event.id),
            url: `fcnfans://event/${event.id}`,
          },
        });
      });
    }

    const result = await dispatchNotifications(supabase, requests);
    return json(200, {
      ok: true,
      eventsMatched: (events ?? []).length,
      ...result,
    });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
