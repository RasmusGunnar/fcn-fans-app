# TheSportsDB Provider Sync

These Edge Functions sync fixtures from TheSportsDB into `public.fixtures`:
- `sync_sportsdb`
- `sync_fcn_fixtures`

## Secrets / Env
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `SPORTSDB_API_KEY`
- `SPORTSDB_BASE_URL` (default: https://www.thesportsdb.com/api/v1/json)
- `SPORTSDB_LEAGUE_ID` (default: 4340)

## Endpoints

### sync_fcn_fixtures
- `fixtures_next_14_days` → `eventsnextleague.php?id={LEAGUE_ID}` (TTL 6h)
- `fixtures_recent` → `eventspastleague.php?id={LEAGUE_ID}` (TTL 1h)

### sync_sportsdb
- `fixtures_next_14_days` → `eventsnextleague.php?id={LEAGUE_ID}` (TTL 6h)
- `fixtures_recent` → `eventspastleague.php?id={LEAGUE_ID}` (TTL 1h)
- `ping` → `all_leagues.php` (TTL 24h)

## Curl examples

Fixtures (next 14 days):

curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-CRON-SECRET: <YOUR_SECRET>" \
  -d '{"job_name":"fixtures_next_14_days"}' \
  https://<PROJECT_REF>.functions.supabase.co/sync_fcn_fixtures

Fixtures (recent):

curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-CRON-SECRET: <YOUR_SECRET>" \
  -d '{"job_name":"fixtures_recent"}' \
  https://<PROJECT_REF>.functions.supabase.co/sync_fcn_fixtures

Fixtures via sync_sportsdb (next 14 days):

curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-CRON-SECRET: <YOUR_SECRET>" \
  -d '{"job_name":"fixtures_next_14_days"}' \
  https://<PROJECT_REF>.functions.supabase.co/sync_sportsdb
