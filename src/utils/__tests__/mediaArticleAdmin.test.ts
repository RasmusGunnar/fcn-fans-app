import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMediaArticleAdminItems,
  canAccessMediaArticleAdmin,
} from '../mediaArticleAdmin';

test('media article management access is app-admin only', () => {
  assert.equal(canAccessMediaArticleAdmin(true), true);
  assert.equal(canAccessMediaArticleAdmin(false), false);
});

test('media article management lists only media articles newest first', () => {
  const items = buildMediaArticleAdminItems([
    {
      id: 'fan-post',
      created_at: '2026-06-10T12:00:00.000Z',
      text: 'Fan post',
      post_type: 'post',
      link_preview: null,
    },
    {
      id: 'article-old',
      created_at: '2026-06-08T12:00:00.000Z',
      text: '',
      post_type: 'media_article',
      link_preview: {
        url: 'https://tipsbladet.dk/nyhed/fcn',
        title: 'Den gamle artikel',
      },
    },
    {
      id: 'article-new',
      created_at: '2026-06-10T10:00:00.000Z',
      text: 'Kort intro',
      post_type: 'media_article',
      link_preview: {
        url: 'https://bold.dk/fodbold/nyheder/fcn',
        title: 'Den nye artikel',
      },
    },
  ]);

  assert.deepEqual(items.map((item) => item.id), ['article-new', 'article-old']);
  assert.equal(items[0].sourceName, 'Bold.dk');
  assert.equal(items[0].domain, 'bold.dk');
  assert.equal(items[0].caption, 'Kort intro');
  assert.equal(items[0].statusLabel, 'Publiceret');
});
