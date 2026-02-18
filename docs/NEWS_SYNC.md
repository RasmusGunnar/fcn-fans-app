# News Sync (Supabase Edge Function)

Denne funktion henter RSS/Atom feeds og upserter til public.news_items, saa tabellen aldrig er tom.

## Secrets / Env vars

Saet secrets i Supabase (CLI eller Dashboard):

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- NEWS_RSS_URLS (comma-separated)
- NEWS_ACTOR_USER_ID (default: 7f7af610-6ea3-480e-a531-3cc1f30862eb)
- NEWS_DEFAULT_SITE_NAME (fx "FCN News")

Eksempel (CLI):

```bash
supabase secrets set \
  SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
  NEWS_RSS_URLS="https://example.com/rss,https://example.com/atom" \
  NEWS_ACTOR_USER_ID="7f7af610-6ea3-480e-a531-3cc1f30862eb" \
  NEWS_DEFAULT_SITE_NAME="FCN News"
```

## Deploy

```bash
supabase functions deploy news-sync
```

## Manuelt test (invoke)

```bash
supabase functions invoke news-sync --no-verify-jwt
```

Forventet respons (forkortet):

```json
{
  "feeds": 2,
  "fetched": 2,
  "parsed": 40,
  "upserted": 40,
  "errors": []
}
```

## Schedule (Dashboard)

1. Gaa til Supabase Dashboard -> Project -> Edge Functions.
2. Vaelg news-sync.
3. Opret en Schedule (Cron) efter behov (fx hver 30. minut).
4. Gem og verificer at runs eksekveres uden fejl.

## Ryd seed entries

```sql
delete from public.news_items
where url like 'https://example.com/fcn/seed-%';
```
