# API Migration Audit: Football providers

## Findings (code/docs)

### Supabase Edge Function: fixtures sync
- File: [supabase/functions/sync_fcn_fixtures/index.ts](supabase/functions/sync_fcn_fixtures/index.ts)
- Usage:
  - API-FOOTBALL base URL (`https://v3.football.api-sports.io`)
  - Provider switch via `FIXTURE_PROVIDER` env (`api-football` | `rapidapi`)
  - Secrets: `API_FOOTBALL_KEY`, `RAPIDAPI_KEY`
  - RapidAPI path is stubbed (`fetchFixturesFromRapidApi`) with TODO
- Action:
  - Replace provider implementation with the new match data source.
  - Remove RapidAPI stub if not needed.
  - Update env variable names and secrets.

### Legacy schema: fixtures provider metadata
- File: [supabase/migrations_legacy/20260116000003_create_fixtures.sql](supabase/migrations_legacy/20260116000003_create_fixtures.sql)
- Usage:
  - `provider` column default `api-football`
- Action:
  - Decide whether to keep `provider` column for audit.
  - If removing API-FOOTBALL references, update default/value naming.

### Documentation references (API-FOOTBALL)
- File: [docs/EVENTS_MODULE.md](docs/EVENTS_MODULE.md)
- Usage:
  - Mentions fixtures synced from API-FOOTBALL
- Action:
  - Update docs to new provider and migration steps.

### Match provider stub (client)
- File: [src/services/matches/index.ts](src/services/matches/index.ts)
- Usage:
  - `ApiFootballProvider` stub referenced by name
- Action:
  - Rename provider class to the new data source to avoid API-FOOTBALL naming.

## Known env vars to replace
- `API_FOOTBALL_KEY`
- `RAPIDAPI_KEY`
- `FIXTURE_PROVIDER`

## Next steps (plan)
1. Implement new provider in Edge function and update secrets. (Status: Edge Function implemented)
2. Rename/remove API-FOOTBALL/RapidAPI references in client and edge code.
3. Update docs and migration notes to reflect new provider.
4. Validate fixtures sync and match rendering end-to-end.
