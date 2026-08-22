/* eslint-env node */

const { expo: baseConfig } = require('./app.json');

const demoSupabaseEnvironment = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://demo.invalid.local',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'demo-local-only',
};

module.exports = () => {
  const demoMode = process.env.EXPO_PUBLIC_APP_MODE?.trim().toLowerCase() === 'demo';

  if (demoMode) {
    Object.assign(process.env, demoSupabaseEnvironment);
  }

  return {
    ...baseConfig,
    name: demoMode ? 'FCN Fans Demo' : baseConfig.name,
    scheme: demoMode ? 'fcnfans-demo' : baseConfig.scheme,
    ios: {
      ...baseConfig.ios,
      bundleIdentifier: demoMode
        ? `${baseConfig.ios.bundleIdentifier}.demo`
        : baseConfig.ios.bundleIdentifier,
    },
    android: {
      ...baseConfig.android,
      // The checked-in native Android project uses dk.rasmusgunnar.fcnfans.
      // Keep production config untouched, while making the demo config match
      // the demo-only Gradle applicationId selected by fcnDemoMode.
      package: demoMode ? 'dk.rasmusgunnar.fcnfans.demo' : baseConfig.android.package,
    },
    extra: {
      ...baseConfig.extra,
      appMode: demoMode ? 'demo' : 'production',
    },
  };
};
