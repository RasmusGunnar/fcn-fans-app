import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
// Read-only reuse of the existing local browser helper. All outputs stay in mobile.
import {
  releaseBrowser,
  until,
} from 'file:///C:/Dev/fcn-fans-web/tests/helpers/release-browser.mjs';
const require = createRequire(import.meta.url);
const esbuild = require(
  process.env.FCN_ESBUILD_PATH ||
    'C:/Users/rasmu/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/esbuild',
);
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'build/weekly-fan-visual');
mkdirSync(output, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(root, 'tests/fixtures/weekly-fan-visual/entry.jsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: path.join(output, 'fixture.js'),
  define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' },
  alias: {
    'react-native': root + '/node_modules/react-native-web/dist/index.js',
    react: root + '/node_modules/react',
    'react-dom': root + '/node_modules/react-dom',
  },
  plugins: [
    {
      name: 'native-boundaries',
      setup(build) {
        build.onResolve({ filter: /^@expo\/vector-icons$|\/supabase$/ }, () => ({
          path: path.join(root, 'tests/fixtures/weekly-fan-visual/platform.jsx'),
        }));
      },
    },
  ],
  logLevel: 'warning',
});
const server = createServer((req, res) => {
  if (req.url === '/fixture.js') {
    res.setHeader('content-type', 'text/javascript');
    return res.end(readFileSync(path.join(output, 'fixture.js')));
  }
  if (req.url === '/icons.ttf') {
    res.setHeader('content-type', 'font/ttf');
    return res.end(
      readFileSync(
        path.join(
          root,
          'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
        ),
      ),
    );
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(
    '<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Ionicons;src:url(/icons.ttf)}body{margin:0;background:#f8f7f4}</style><div id="root"></div><script src="/fixture.js"></script></html>',
  );
});
await new Promise((resolve) => server.listen(3372, '127.0.0.1', resolve));
let browser;
const results = [];
try {
  browser = await releaseBrowser(output, 9372, 'http://127.0.0.1:3372/', true);
  for (const width of [360, 390]) {
    await browser.size(width, true);
    for (const phase of ['fresh', 'older'])
      for (const long of [false, true])
        for (const extras of [false, true]) {
          await browser.navigate(
            `http://127.0.0.1:3372/?phase=${phase}${long ? '&long' : ''}${extras ? '&reference&score' : ''}`,
          );
          await until(() =>
            browser.evaluate(`!!document.querySelector('[data-testid="weekly-fan-card"]')`),
          );
          await browser.evaluate('document.fonts.ready.then(()=>true)');
          const geometry = await browser.evaluate(
            `(()=>{const e=document.querySelector('[data-testid="weekly-fan-card"]'); const r=e.getBoundingClientRect();return {height:r.height,text:e.textContent,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...e.querySelectorAll('[role=button]')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))}})()`,
          );
          assert.equal(geometry.overflow, false);
          assert.ok(geometry.text.includes('UGENS FAN'));
          assert.ok(geometry.text.includes(long ? 'En fan' : 'Hønsefaderen'));
          assert.equal(geometry.text.includes('Tak for engagementet'), true);
          assert.equal(geometry.text.includes('42 point'), extras);
          for (const b of geometry.buttons)
            assert.ok(b.width >= 44 && b.height >= 44, JSON.stringify(b));
          assert.ok(geometry.height < 260, JSON.stringify({ phase, geometry }));
          await browser.click('[aria-label$="profil · Ugens fan"]');
          if (extras) await browser.click('[aria-label="Se vinderens bidrag"]');
          assert.deepEqual(
            await browser.evaluate('window.calls'),
            extras ? ['profile', 'reference'] : ['profile'],
          );
          if (!long && !extras) await browser.shot(`${width}-${phase}`);
          if (long && extras) await browser.shot(`${width}-${phase}-long`);
          results.push({ width, phase, long, extras, ...geometry });
        }
  }
  assert.deepEqual(browser.errors, []);
  console.log(
    JSON.stringify(
      {
        passed: results.length,
        results: results.map(({ width, phase, long, extras, height }) => ({
          width,
          phase,
          long,
          extras,
          height,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify({ results, errors: browser?.errors }, null, 2),
  );
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
