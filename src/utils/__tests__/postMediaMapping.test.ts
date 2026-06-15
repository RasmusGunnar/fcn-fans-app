import assert from 'node:assert/strict';
import test from 'node:test';
import type { Post } from '../../types/post';
import { toPostFeedItem } from '../postFeedItem';
import {
  normalizeMedia,
  resolveRenderableMediaWith,
  resolveVideoThumbnailUrlWith,
} from '../postMediaMapping';

const resolveStoragePublicUrl = (bucket: string, path: string) =>
  `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`;

test('video attachment keeps its type, public URL, and thumbnail metadata through feed mapping', () => {
  const rawMedia = JSON.stringify([
    {
      bucket: 'post-media',
      path: 'user-1/video.mp4',
      type: 'video',
      width: 1080,
      height: 1920,
      thumbnail_bucket: 'post-media',
      thumbnail_path: 'user-1/video.thumb.jpg',
    },
  ]);
  const post: Post = {
    id: 'video-post-1',
    postType: 'post',
    authorName: 'Fan',
    createdAt: '2026-06-09T10:00:00.000Z',
    text: 'Video post',
    media: normalizeMedia(rawMedia),
    likesCount: 0,
    commentsCount: 0,
    likedByMe: false,
  };
  const feedItem = toPostFeedItem(post);

  assert.equal(feedItem.kind, 'post');

  const [mapped] = resolveRenderableMediaWith(feedItem.data.media, resolveStoragePublicUrl);
  assert.equal(mapped.type, 'video');
  assert.equal(
    mapped.uri,
    'https://example.supabase.co/storage/v1/object/public/post-media/user-1/video.mp4',
  );
  assert.equal(mapped.thumbnail_bucket, 'post-media');
  assert.equal(mapped.thumbnail_path, 'user-1/video.thumb.jpg');
});

test('legacy video publicUrl remains unchanged through mapping', () => {
  const publicUrl = 'https://cdn.example.com/posts/video.mp4';
  const [mapped] = resolveRenderableMediaWith(
    [{ type: 'video', publicUrl }],
    resolveStoragePublicUrl,
  );

  assert.equal(mapped.type, 'video');
  assert.equal(mapped.uri, publicUrl);
});

test('video poster metadata resolves without loading the video', () => {
  assert.equal(
    resolveVideoThumbnailUrlWith(
      {
        type: 'video',
        bucket: 'post-media',
        path: 'user-1/video.mp4',
        thumbnailPath: 'user-1/video.thumb.jpg',
      },
      resolveStoragePublicUrl,
    ),
    'https://example.supabase.co/storage/v1/object/public/post-media/user-1/video.thumb.jpg',
  );

  assert.equal(
    resolveVideoThumbnailUrlWith(
      {
        type: 'video',
        thumbnail_url: 'https://cdn.example.com/video.thumb.jpg',
      },
      resolveStoragePublicUrl,
    ),
    'https://cdn.example.com/video.thumb.jpg',
  );

  assert.equal(
    resolveVideoThumbnailUrlWith(
      {
        type: 'video',
        path: 'legacy/video.mov',
      },
      resolveStoragePublicUrl,
    ),
    null,
  );
});
