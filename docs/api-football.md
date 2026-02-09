# API-Football (RapidAPI) Sync

This Edge Function syncs fixtures from RapidAPI API-Football into `public.fixtures`.

## Edge Function
- Function: `sync_api_football`
- Endpoint: `POST /functions/v1/sync_api_football`
- Auth: `X-CRON-SECRET` header (must match `CRON_SECRET`)

## Environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `RAPIDAPI_KEY`
- `RAPIDAPI_HOST`
- `API_FOOTBALL_BASE_URL` (example: `https://api-football-v1.p.rapidapi.com/v3`)

## Job payloads
- `fixtures_next_14_days`
  - Uses `job_params.days_ahead` (default 14)
  - Uses `job_params.league_id` (default 119)
  - Uses `job_params.season` (default current year)
  - Cache TTL: 1 hour
- `fixtures_live`
  - Cache TTL: 45 seconds

## Example curl
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-CRON-SECRET: <YOUR_SECRET>" \
  -d '{"job_name":"fixtures_next_14_days"}' \
  https://<PROJECT_REF>.functions.supabase.co/sync_api_football

## Notes
- Caching uses `public.api_cache` with a SHA-256 key derived from endpoint + params.
- Upsert uses `external_id` as conflict key.
- Defensive parsing ensures missing fields do not crash the sync.
