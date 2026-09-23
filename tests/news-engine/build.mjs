import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const esbuild = require(
  process.env.ESBUILD_PATH ||
    'C:/Users/rasmu/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/esbuild',
);
await esbuild.build({
  entryPoints: ['tests/news-engine/entry.jsx'],
  outfile: 'artifacts/news-engine/native.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.js': 'jsx' },
  define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  alias: { 'react-native': 'react-native-web' },
  plugins: [
    {
      name: 'test-platform',
      setup(b) {
        b.onResolve(
          {
            filter:
              /(@react-navigation\/native$|@expo\/vector-icons$|\/supabase$|\/logger$|\/OptionsMenu$|\/comments\/InlineComments$)/,
          },
          () => ({ path: path.resolve('tests/news-engine/platform.jsx') }),
        );
      },
    },
  ],
  logLevel: 'warning',
});
console.log(
  'PASS: bundled real NewsCard, ArticlePreview, CardRoot, HomeFeedFilters and newsApi with React Native Web. Auth/navigation/icons/comments backend are fixture boundaries.',
);
