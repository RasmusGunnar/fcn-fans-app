# parse-link Edge Function

Supabase Edge Function til at parse link previews fra URLs.

## Deploy

```bash
supabase functions deploy parse-link
```

## Test lokalt

```bash
supabase functions serve parse-link
```

## API

**Input:**
```json
{
  "url": "https://example.com/article"
}
```

**Output:**
```json
{
  "resolvedUrl": "https://example.com/article",
  "title": "Article Title",
  "description": "Article description...",
  "imageUrl": "https://example.com/og-image.jpg",
  "siteName": "example.com"
}
```

## Features

- Følger redirects automatisk
- Parser OpenGraph (og:*) og Twitter Card (twitter:*) meta tags
- Fallback til standard HTML meta tags og `<title>`
- Resolver relative image URLs til absolute
- CORS enabled for client-side requests
