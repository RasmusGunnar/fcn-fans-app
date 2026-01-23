// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

type Payload = {
  toUserId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
};

serve(async (req) => {
  try {
    const payload: Payload = await req.json();
    if (!payload?.toUserId)
      return new Response(JSON.stringify({ error: 'missing toUserId' }), { status: 400 });

    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key)
      return new Response(JSON.stringify({ error: 'missing env' }), { status: 500 });

    const profileRes = await fetch(`${url}/rest/v1/profiles?id=eq.${payload.toUserId}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
    const profiles = await profileRes.json();
    const token = profiles?.[0]?.expo_push_token;
    if (!token)
      return new Response(JSON.stringify({ ok: true, skipped: 'no token' }), { status: 200 });

    const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
      }),
    });
    const pushJson = await pushRes.json();
    return new Response(JSON.stringify({ ok: true, result: pushJson }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
