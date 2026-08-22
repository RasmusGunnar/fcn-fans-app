/* eslint-env node */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const mode = process.argv[2];
const expoArgs = process.argv.slice(3);

const demoEnvironment = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://demo.invalid.local',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'demo-local-only',
  ORG_GRADLE_PROJECT_fcnDemoMode: 'true',
};

if (!['demo', 'production'].includes(mode) || expoArgs.length === 0) {
  console.error('Usage: node scripts/run-expo-mode.cjs <demo|production> <expo arguments...>');
  process.exit(1);
}

const expoCli = path.join(__dirname, '..', 'node_modules', 'expo', 'bin', 'cli');
const result = spawnSync(process.execPath, [expoCli, ...expoArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_APP_MODE: mode,
    ...(mode === 'demo' ? demoEnvironment : {}),
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
