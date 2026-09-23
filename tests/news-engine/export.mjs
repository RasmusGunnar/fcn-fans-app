import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const original = fs.readFileSync('package.json', 'utf8');
const pkg = JSON.parse(original);
pkg.main = 'artifacts/news-engine/export-entry.js';
fs.mkdirSync('artifacts/news-engine', { recursive: true });
fs.writeFileSync(
  pkg.main,
  "import {registerRootComponent} from 'expo';import App from '../../App';registerRootComponent(App);\n",
);
try {
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
  for (const platform of ['ios', 'android']) {
    const r = spawnSync(
      process.execPath,
      [
        'node_modules/expo/bin/cli',
        'export',
        '--platform',
        platform,
        '--max-workers',
        '2',
        '--output-dir',
        path.resolve('artifacts/news-engine/export-' + platform),
      ],
      {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        env: {
          ...process.env,
          EXPO_NO_DOTENV: '1',
          EXPO_OFFLINE: '1',
          EXPO_NO_TELEMETRY: '1',
          NODE_ENV: 'production',
          CI: '1',
          EXPO_PUBLIC_APP_MODE: 'production',
          EXPO_PUBLIC_SUPABASE_URL: 'https://news-validation.invalid',
          EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_local_compile_only',
        },
      },
    );
    fs.writeFileSync(
      'artifacts/news-engine/export-' + platform + '.log',
      r.stdout + '\n' + r.stderr,
    );
    console.log(platform + ': ' + r.status);
    if (r.status) console.log((r.stdout + r.stderr).slice(-2000));
  }
} finally {
  fs.writeFileSync('package.json', original);
}
