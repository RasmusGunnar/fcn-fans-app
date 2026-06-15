import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractArticleMedia,
  sanitizeNewsHeroImageUrl,
  selectNewsHeroImageUrl,
} from '../newsMedia.js';

const CAMPO_ARTICLE_URL =
  'https://campo.dk/2026/06/15/fc-nordsjaelland-forlaenger-forsvarsspiller/';
const CAMPO_IMAGE_URL =
  'https://campo.dk/wp-content/uploads/2026/06/campo-victor-gustafsen-fc-nordsjaelland.jpg';

test('resolves Campo Yoast JSON-LD image references to the matching ImageObject', () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "NewsArticle",
            "@id": "${CAMPO_ARTICLE_URL}#article",
            "image": { "@id": "${CAMPO_ARTICLE_URL}#primaryimage" }
          },
          {
            "@type": "ImageObject",
            "@id": "${CAMPO_ARTICLE_URL}#primaryimage",
            "url": "${CAMPO_IMAGE_URL}",
            "contentUrl": "${CAMPO_IMAGE_URL}"
          }
        ]
      }
    </script>
  `;

  assert.equal(extractArticleMedia(html, CAMPO_ARTICLE_URL).imageUrl, CAMPO_IMAGE_URL);
});

test('rejects unresolved same-document JSON-LD image fragments', () => {
  const unresolvedImageUrl = `${CAMPO_ARTICLE_URL}#primaryimage`;
  const html = `
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "image": { "@id": "${unresolvedImageUrl}" }
      }
    </script>
  `;

  assert.equal(sanitizeNewsHeroImageUrl(unresolvedImageUrl, CAMPO_ARTICLE_URL), null);
  assert.equal(extractArticleMedia(html, CAMPO_ARTICLE_URL).imageUrl, null);
});

test('keeps a valid RSS image when the HTML image candidate is invalid', () => {
  assert.equal(
    selectNewsHeroImageUrl(`${CAMPO_ARTICLE_URL}#primaryimage`, CAMPO_IMAGE_URL, CAMPO_ARTICLE_URL),
    CAMPO_IMAGE_URL,
  );
});

test('prefers a direct og:image over a valid JSON-LD image', () => {
  const openGraphImage = 'https://cdn.example.com/fcn-open-graph.jpg';
  const jsonLdImage = 'https://cdn.example.com/fcn-json-ld.jpg';
  const html = `
    <meta property="og:image" content="${openGraphImage}">
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "image": "${jsonLdImage}"
      }
    </script>
  `;

  assert.equal(
    extractArticleMedia(html, 'https://example.com/fcn-article').imageUrl,
    openGraphImage,
  );
});

test('preserves Bold-style direct OpenGraph images unchanged', () => {
  const imageUrl = 'https://bold.dk/picture/1340x880/20250825-212634-7.jpg';
  const html = `<meta property="og:image" content="${imageUrl}">`;

  assert.equal(
    extractArticleMedia(
      html,
      'https://bold.dk/fodbold/nyheder/porto-praesident-bekraefter-interesse-for-fcn-stjerne',
    ).imageUrl,
    imageUrl,
  );
});
