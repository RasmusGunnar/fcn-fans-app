import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildApprovedCandidatePostPayload,
  dedupeCandidateDiscoveries,
  extractHtmlListingCandidates,
  isPaywalledDocument,
  normalizeCandidateUrl,
  scoreMediaArticleCandidate,
} from '../mediaArticleCandidateCore.js';

test('creates an FCN candidate from a strong title match', () => {
  const relevance = scoreMediaArticleCandidate({
    title: 'FC Nordsjælland henter ny spiller',
    description: 'Superligaklubben har præsenteret sin nye profil.',
    url: 'https://bold.dk/fodbold/nyheder/fcn-henter-ny-spiller',
  });

  assert.equal(relevance.accepted, true);
  assert.equal(relevance.score, 100);
  assert.deepEqual(relevance.detectedKeywords, ['FC Nordsjælland', 'Nordsjælland', 'FCN']);
});

test('deduplicates canonical discoveries after removing tracking parameters', () => {
  const result = dedupeCandidateDiscoveries([
    {
      sourceUrl: 'https://campo.dk/artikel/fcn-vinder?utm_source=facebook',
      title: 'FCN vinder igen',
    },
    {
      sourceUrl: 'https://campo.dk/artikel/fcn-vinder#comments',
      title: 'FCN vinder igen',
    },
  ]);

  assert.equal(result.unique.length, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.unique[0]?.sourceUrl, 'https://campo.dk/artikel/fcn-vinder');
});

test('scores club-specific pages higher than peripheral mentions', () => {
  const clubPage = scoreMediaArticleCandidate({
    title: 'Truppen er klar til søndagens kamp',
    url: 'https://fcn.dk/nyheder/2026/juni/truppen-er-klar',
    fromClubPage: true,
  });
  const peripheral = scoreMediaArticleCandidate({
    title: 'Rundt om dansk fodbold',
    description: 'FCN nævnes kort blandt weekendens øvrige resultater.',
    url: 'https://example.com/sport/rundt-om-dansk-fodbold',
  });

  assert.equal(clubPage.accepted, true);
  assert.ok(clubPage.score >= 50);
  assert.equal(peripheral.accepted, false);
  assert.equal(peripheral.score, 25);
});

test('approving a pending candidate creates a normal media_article post payload', () => {
  const payload = buildApprovedCandidatePostPayload({
    status: 'pending',
    authorId: 'admin-user-id',
    canonicalUrl: 'https://bold.dk/fodbold/nyheder/fcn-sejr',
    sourceName: 'Bold.dk',
    title: 'FCN tog sejren',
    description: 'Kampen blev afgjort sent.',
    imageUrl: 'https://bold.dk/images/fcn.jpg',
    caption: 'En stærk afslutning.',
  });

  assert.equal(payload.post_type, 'media_article');
  assert.deepEqual(payload.feed_targets, ['home']);
  assert.equal(payload.link_preview.url, 'https://bold.dk/fodbold/nyheder/fcn-sejr');
  assert.equal(payload.link_preview.siteName, 'Bold.dk');
  assert.equal(payload.text, 'En stærk afslutning.');
});

test('rejected and ignored candidates cannot create feed post payloads', () => {
  for (const status of ['rejected', 'ignored'] as const) {
    assert.throws(
      () =>
        buildApprovedCandidatePostPayload({
          status,
          authorId: 'admin-user-id',
          canonicalUrl: 'https://example.com/article',
          sourceName: 'Example',
          title: 'FCN article',
        }),
      /only pending/,
    );
  }
});

test('HTML adapter extracts only configured publisher article links', () => {
  const html = `
    <nav><a href="/fodbold/klubber/fc-nordsjaelland">FC Nordsjælland</a></nav>
    <main>
      <a href="/fodbold/nyheder/fcn-henter-angriber?utm_medium=social">
        <span>FCN henter ny angriber</span>
      </a>
      <a href="https://other.example/sport/fcn">Ekstern artikel om FCN</a>
      <a href="/privacy/cookies">Læs om vores cookies</a>
    </main>
  `;

  const items = extractHtmlListingCandidates(
    html,
    'https://bold.dk/fodbold/klubber/fc-nordsjaelland',
    {
      allowedHosts: ['bold.dk'],
      articlePathPrefixes: ['/fodbold/nyheder/'],
      fromClubPage: true,
    },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'FCN henter ny angriber');
  assert.equal(items[0]?.sourceUrl, 'https://bold.dk/fodbold/nyheder/fcn-henter-angriber');
  assert.equal(items[0]?.fromClubPage, true);
});

test('HTML adapter discovers article URLs embedded in client-rendered page data', () => {
  const html = `
    <script>
      window.__DATA__ = [
        "/fodbold/nyheder/fcn-forlaenger-med-stortalent/",
        "/fodbold/stillinger/superligaen"
      ];
    </script>
  `;

  const items = extractHtmlListingCandidates(
    html,
    'https://bold.dk/fodbold/klubber/fc-nordsjaelland',
    {
      allowedHosts: ['bold.dk'],
      articlePathPrefixes: ['/fodbold/nyheder/'],
      fromClubPage: true,
    },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'fcn forlaenger med stortalent');
  assert.equal(
    items[0]?.sourceUrl,
    'https://bold.dk/fodbold/nyheder/fcn-forlaenger-med-stortalent',
  );
});

test('paywall marker is rejected and URL normalization keeps canonical identity', () => {
  assert.equal(
    isPaywalledDocument(
      '<script type="application/ld+json">{"isAccessibleForFree":false}</script>',
    ),
    true,
  );
  assert.equal(
    normalizeCandidateUrl('https://WWW.TIPSBladet.dk/nyhed/fcn?utm_campaign=test#top'),
    'https://tipsbladet.dk/nyhed/fcn',
  );
});
