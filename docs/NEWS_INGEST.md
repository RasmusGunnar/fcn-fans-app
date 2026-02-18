# News Ingest (Single URL)

Denne edge function tager en enkelt artikel-URL og opretter et news_item i public.news_items.

## Secrets / Env vars

- NEWS_DEFAULT_SITE_NAME (fallback site name)
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Eksempel (CLI):

```bash
supabase secrets set \
  NEWS_DEFAULT_SITE_NAME="FCN News" \
  SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
  SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

## Deploy

```bash
supabase functions deploy news-ingest
```

## Test (PowerShell)

```powershell
Invoke-RestMethod -Method Post \
  -Uri "https://YOUR_PROJECT.functions.supabase.co/news-ingest" \
  -Headers @{ "Authorization" = "Bearer YOUR_ACCESS_TOKEN" } \
  -Body '{"url":"https://example.com/article","site_name":"FCN News"}' \
  -ContentType "application/json"
```

## Test (curl)

```bash
curl -X POST "https://YOUR_PROJECT.functions.supabase.co/news-ingest" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/article","site_name":"FCN News"}'

## SQL migration

Kores med Supabase CLI:

```bash
supabase db push
```
```

## Valid URL

- Skal vaere en reel artikel-URL (http/https) der returnerer HTML.
- URLs uden title/meta tags giver 422.
