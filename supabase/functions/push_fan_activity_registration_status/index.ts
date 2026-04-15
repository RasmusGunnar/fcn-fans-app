// deno-lint-ignore-file no-explicit-any
import {
  buildNotificationDedupeKey,
  createAdminClient,
  dispatchNotifications,
  fetchExistingNotificationDedupeKeys,
  fetchPushPreferencesByUserIds,
  fetchPushTokensForUsers,
  isPushPreferenceEnabled,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type RegistrationStatus = 'pending_payment' | 'pending_verification' | 'confirmed';

type Payload = {
  registrationId?: string;
  status?: RegistrationStatus;
};

type RegistrationRow = {
  id: string;
  status: RegistrationStatus;
  user_id: string;
  fan_activity_id: string;
  fan_activities?: {
    id: string;
    title: string | null;
  } | null;
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function readRequestBody(req: Request): Promise<Payload> {
  try {
    const raw = await req.text();
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Payload;
  } catch {
    return {};
  }
}

function getNotificationCopy(status: RegistrationStatus, activityTitle: string) {
  if (status === 'confirmed') {
    return {
      title: 'Plads bekræftet',
      body: `Din plads til ${activityTitle} er bekræftet.`,
      notificationType: 'fan_activity_registration_confirmed',
    };
  }

  return {
    title: 'Betaling mangler',
    body: `Din tilmelding til ${activityTitle} er ikke endeligt bekræftet endnu.`,
    notificationType: 'fan_activity_registration_payment_missing',
  };
}

Deno.serve(async (req) => {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.response) {
      return auth.response;
    }

    const callerUserId = auth.user.id as string;
    const body = await readRequestBody(req);
    const registrationId = readString(body.registrationId);
    const status = readString(body.status) as RegistrationStatus | null;

    if (!registrationId || !status) {
      return json(400, { error: 'Missing registrationId or status' });
    }

    if (status !== 'confirmed' && status !== 'pending_payment') {
      return json(200, { ok: true, skipped: 'unsupported_status' });
    }

    const supabase = createAdminClient();
    const { data: registration, error: registrationError } = await supabase
      .from('fan_activity_registrations')
      .select('id, status, user_id, fan_activity_id, fan_activities(id, title)')
      .eq('id', registrationId)
      .maybeSingle();

    if (registrationError) {
      throw registrationError;
    }

    const row = (registration as RegistrationRow | null) ?? null;
    if (!row?.id) {
      return json(404, { error: 'Registration not found' });
    }

    const canManage = await supabase.rpc('can_manage_fan_activity_registrations', {
      p_fan_activity_id: row.fan_activity_id,
      p_user_id: callerUserId,
    });

    if (canManage.error) {
      throw canManage.error;
    }

    if (canManage.data !== true) {
      return json(403, { error: 'Not allowed to manage this registration' });
    }

    if (row.status !== status) {
      return json(200, { ok: true, skipped: 'status_mismatch' });
    }

    const targetUserId = readString(row.user_id);
    if (!targetUserId) {
      return json(200, { ok: true, skipped: 'missing_user' });
    }

    const preferencesByUserId = await fetchPushPreferencesByUserIds(supabase, [targetUserId]);
    if (!isPushPreferenceEnabled(preferencesByUserId, targetUserId, 'community_activity')) {
      return json(200, { ok: true, skipped: 'preferences_disabled' });
    }

    const tokens = await fetchPushTokensForUsers(supabase, [targetUserId]);
    if (tokens.length === 0) {
      return json(200, { ok: true, skipped: 'no_token' });
    }

    const activityTitle = readString(row.fan_activities?.title) ?? 'fanaktiviteten';
    const copy = getNotificationCopy(status, activityTitle);
    const dedupeKeys = tokens.map((tokenRow: any) =>
      buildNotificationDedupeKey(copy.notificationType, registrationId, tokenRow.user_id),
    );
    const existingDedupeKeys = await fetchExistingNotificationDedupeKeys(supabase, dedupeKeys);

    const requests = tokens.flatMap((tokenRow: any) => {
      const dedupeKey = buildNotificationDedupeKey(
        copy.notificationType,
        registrationId,
        tokenRow.user_id,
      );

      if (existingDedupeKeys.has(dedupeKey)) {
        return [];
      }

      return [
        {
          userId: tokenRow.user_id as string,
          pushToken: tokenRow.push_token as string,
          notificationType: copy.notificationType,
          dedupeKey,
          title: copy.title,
          body: copy.body,
          data: {
            notificationType: copy.notificationType,
            targetType: 'home_feed',
            type: 'home_feed',
            registrationId,
            fanActivityId: row.fan_activity_id,
          },
        },
      ];
    });

    if (requests.length === 0) {
      return json(200, { ok: true, skipped: 'duplicate' });
    }

    const result = await dispatchNotifications(supabase, requests);
    return json(200, { ok: true, ...result });
  } catch (error) {
    return json(500, { error: String(error) });
  }
});
