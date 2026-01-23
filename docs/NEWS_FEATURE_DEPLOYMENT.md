# News Feature Implementation

## Overview

This feature allows users to share news articles by URL with automatic link preview generation.

## Components

### 1. Database Migration

- **File**: `supabase/migrations/20260119_create_news_items.sql`
- **Description**: Creates `news_items` table with RLS policies
- **Run**: Execute SQL in Supabase Dashboard SQL Editor

### 2. Edge Function

- **File**: `supabase/functions/parse-link/index.ts`
- **Description**: Parses HTML and extracts Open Graph/Twitter Card metadata
- **Features**:
  - Follows redirects
  - Parses meta tags (og:_, twitter:_, standard meta)
  - Resolves relative image URLs to absolute
  - Returns structured link preview data

### 3. Frontend Components

- **NewsComposer**: URL input and preview interface
- **NewsCard**: Displays news items in feed
- **PostComposer**: Post creation with optional images
- **CreateSheet**: 2-step modal (choose type → compose)

## Deployment Steps

### 1. Deploy Database Migration

```bash
# Option A: Via Supabase Dashboard
1. Go to SQL Editor in Supabase Dashboard
2. Copy content from supabase/migrations/20260119_create_news_items.sql
3. Run the migration

# Option B: Via CLI
cd supabase
supabase db push
```

### 2. Deploy Edge Function

```bash
# Deploy parse-link function
supabase functions deploy parse-link

# Verify deployment
supabase functions list
```

### 3. Test Edge Function

```bash
# Test locally
supabase functions serve parse-link

# Test with curl
curl -X POST http://localhost:54321/functions/v1/parse-link \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

### 4. Frontend Updates

- No manual deployment needed - React Native will hot reload

## Testing Checklist

### Posts Feature (must continue working)

- [ ] Create post without image
- [ ] Create post with image (camera)
- [ ] Create post with image (library)
- [ ] Old posts still display correctly
- [ ] Image upload works
- [ ] Feed refreshes after post creation

### News Feature (new)

- [ ] Enter URL and fetch preview
- [ ] Preview shows title, description, image
- [ ] Preview handles missing fields gracefully
- [ ] "Del nyhed" button disabled until preview loaded
- [ ] News item appears in feed after publishing
- [ ] Error handling for invalid URLs
- [ ] Error handling for edge function failures

### Combined Feed

- [ ] Posts and news items merge correctly
- [ ] Sorting by created_at works
- [ ] Feed doesn't crash if news_items table missing (PGRST205 handling)

## Troubleshooting

### Edge Function Issues

```bash
# Check logs
supabase functions logs parse-link

# Common issues:
# - CORS errors: Check corsHeaders are set
# - Timeout: Increase function timeout in dashboard
# - Network errors: Some sites block bots (check User-Agent)
```

### Database Issues

```bash
# Verify table exists
SELECT * FROM news_items LIMIT 1;

# Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'news_items';

# Reset if needed
DROP TABLE IF EXISTS news_items CASCADE;
# Then re-run migration
```

### Frontend Issues

```bash
# Clear Metro bundler cache
npm start -- --reset-cache

# Check console logs for:
# - [newsApi] Edge function error
# - [NewsComposer] Publish error
# - [FeedProvider] Combined feed
```

## API Reference

### Edge Function: parse-link

**Endpoint**: `/functions/v1/parse-link`

**Request**:

```json
{
  "url": "https://example.com/article"
}
```

**Response**:

```json
{
  "resolvedUrl": "https://example.com/article",
  "title": "Article Title",
  "description": "Article description...",
  "imageUrl": "https://example.com/og-image.jpg",
  "siteName": "example.com"
}
```

**Errors**:

```json
{
  "error": "Failed to fetch URL: 404 Not Found"
}
```

## Future Improvements

- [ ] Add caching for link previews
- [ ] Support more metadata formats (JSON-LD, etc)
- [ ] Add preview refresh button
- [ ] Support video embeds
- [ ] Add URL validation before fetching
- [ ] Implement rate limiting
