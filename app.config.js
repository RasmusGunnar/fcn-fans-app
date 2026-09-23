/* eslint-env node */

const { expo: baseConfig } = require('./app.json');

const demoSupabaseEnvironment = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://demo.invalid.local',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'demo-local-only',
};

module.exports = () => {
  const newsEngineTest = process.env.FCN_NEWS_ENGINE_TEST === '1';
  if (newsEngineTest) {
    let endpoint;
    try { endpoint = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL || ''); } catch { /* rejected below */ }
    const expectedHost = process.env.FCN_NEWS_ENGINE_STAGING_HOST;
    if (!endpoint || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
        !expectedHost || endpoint.hostname !== expectedHost ||
        endpoint.hostname === 'benmedekvstxetcomngr.supabase.co' ||
        !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('NEWS_ENGINE_TEST_BLOCKED: configure an explicit non-production HTTPS staging host and its publishable/anon key.');
    }
  }
  const demoMode = process.env.EXPO_PUBLIC_APP_MODE?.trim().toLowerCase() === 'demo';

  if (demoMode) {
    Object.assign(process.env, demoSupabaseEnvironment);
  }

  return {
    ...baseConfig,
    name: newsEngineTest ? 'FCN Fans Test' : demoMode ? 'FCN Fans Demo' : baseConfig.name,
    scheme: demoMode ? 'fcnfans-demo' : baseConfig.scheme,
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: demoMode
        ? `${baseConfig.ios.bundleIdentifier}.demo`
        : baseConfig.ios.bundleIdentifier,
    },
    android: {
      ...baseConfig.android,
      // Production owns the canonical Play identity. Demo derives an isolated
      // applicationId without coupling the host app to native module namespaces.
      package: demoMode ? `${baseConfig.android.package}.demo` : baseConfig.android.package,
    },
    extra: {
      ...baseConfig.extra,
      appMode: demoMode ? 'demo' : 'production',
      ...(newsEngineTest ? { validationEnvironment: 'staging' } : {}),
    },
  };
};
