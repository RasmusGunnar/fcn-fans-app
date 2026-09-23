import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
const web = process.env.NEWS_WEB_WORKTREE || 'C:/Dev/fcn-fans-web-news-intake-recovery';
const { releaseBrowser, until } = await import(
  'file:///' + web.replaceAll('\\', '/') + '/tests/helpers/release-browser.mjs'
);
const published = JSON.parse(
  fs.readFileSync(path.join(web, 'artifacts/news-engine/published-fixture.json'), 'utf8'),
);
const rows = [
  published,
  ...['social', 'podcast', 'video'].map((format, i) => ({
    ...published,
    id: `a7220000-0000-4000-8000-00000000008${i}`,
    title: ['FCN fra træningsbanen', 'Nordsjælland Dreamin’: optakt', 'FCN: Se træningen'][i],
    summary: null,
    description: 'FCN gør klar til kamp.',
    url: 'https://example.test/' + format,
    engine_metadata: {
      format,
      originalSource: format === 'podcast' ? "Nordsjælland Dreamin'" : 'FCN.dk',
      program: format === 'podcast' ? "Nordsjælland Dreamin'" : null,
      account: '@FCNordsjaelland',
      platform: format === 'social' ? 'x' : format === 'video' ? 'youtube' : null,
      originalText: 'FCN gør klar til kamp på træningsbanen.',
      textBasis: format === 'podcast' ? 'description' : 'social_text',
      summaryOrigin: 'none',
    },
  })),
];
const out = path.resolve('artifacts/news-engine');
fs.mkdirSync(out, { recursive: true });
const server = createServer((req, res) => {
  if (req.url === '/native.js') {
    res.setHeader('content-type', 'text/javascript');
    return res.end(fs.readFileSync(path.join(out, 'native.js')));
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(
    `<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f7f6f4;font-family:Arial}*{box-sizing:border-box}</style><div id="root"></div><script>window.__newsRows=${JSON.stringify(rows)};window.__actions=[];</script><script src="/native.js"></script></html>`,
  );
});
await new Promise((r) => server.listen(3348, '127.0.0.1', r));
let browser;
try {
  browser = await releaseBrowser(out, 9394, 'http://127.0.0.1:3348', true);
  await until(() => browser.evaluate('window.__mapped?.length===4'), 'Native news mapping');
  assert.deepEqual(browser.errors, []);
  console.log('GUT CHECK PASS: actual native news cards and format controls render.');
  for (const width of [390, 360]) {
    await browser.size(width, true);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
    await browser.shot('mobile-all-' + width);
  }
  for (const [format, label] of [
    ['article', 'Nyheder'],
    ['social', 'Sociale medier'],
    ['podcast', 'Podcasts'],
    ['video', 'Video'],
  ]) {
    await browser.agent('find', 'role', 'tab', 'click', '--name', label, '--exact');
    await until(
      () => browser.evaluate('document.querySelectorAll("[data-canonical-id]").length===1'),
      format,
    );
    assert.equal(
      await browser.evaluate('document.querySelector("[data-canonical-id]").dataset.canonicalId'),
      rows.find((r) => r.engine_metadata.format === format).id,
    );
    await browser.shot('mobile-' + format + '-360');
  }
  await browser.agent('find', 'role', 'tab', 'click', '--name', 'Nyheder', '--exact');
  assert.equal(await browser.evaluate('window.__mapped[0].id'), published.id);
  fs.writeFileSync(
    path.join(out, 'browser.json'),
    JSON.stringify(
      {
        status: 'PASS',
        environment:
          'actual native components on React Native Web; platform/comments backend fixture',
        formats: 4,
        canonicalId: published.id,
        widths: [390, 360],
        physicalDevice: 'NOT_RUN',
        hostedWrites: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: four native formats, real newsApi mapping, canonical UUID parity, no overflow or runtime exceptions',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
