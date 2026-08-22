import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import {
  extractInstagramShare,
  fromDatabaseExternalShare,
  fromInstagramLinkPreview,
  parseInstagramUrl,
  removeStandaloneInstagramUrl,
  toDatabaseExternalShare,
  toInstagramLinkPreview,
} from '../../lib/instagram';
import {
  canPresentIncomingShare,
  INCOMING_SHARE_TTL_MS,
  mergeIncomingShare,
  normalizeNativeIncomingShare,
  parseNativeIncomingShareJson,
} from '../incomingShare';

const NOW = Date.parse('2026-08-11T12:00:00.000Z');

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

test('parses supported Instagram resources and strips tracking data', () => {
  assert.deepEqual(parseInstagramUrl('https://instagram.com/p/Abc_12/?utm_source=x#fragment'), {
    provider: 'instagram',
    canonicalUrl: 'https://www.instagram.com/p/Abc_12/',
    displayUrl: 'https://www.instagram.com/p/Abc_12/',
    resourceType: 'post',
    externalId: 'Abc_12',
  });
  assert.equal(
    parseInstagramUrl('https://www.instagram.com/reels/ZXcv_987/')?.canonicalUrl,
    'https://www.instagram.com/reel/ZXcv_987/',
  );
  assert.equal(parseInstagramUrl('https://www.instagram.com/tv/TV_code9/')?.resourceType, 'post');
  assert.equal(
    parseInstagramUrl('https://www.instagram.com/fcnordsjaelland/')?.resourceType,
    'profile',
  );
});

test('extracts an Instagram URL from share text and trailing punctuation', () => {
  const result = extractInstagramShare(
    'Se denne reel: https://www.instagram.com/reel/ABCDE_12/?igsh=tracking).',
  );
  assert.equal(result?.canonicalUrl, 'https://www.instagram.com/reel/ABCDE_12/');
});

test('chooses the first valid Instagram URL deterministically among other links', () => {
  const result = extractInstagramShare(
    'https://example.test/a https://instagram.com/p/FIRST_1/ https://instagram.com/reel/SECOND_2/',
  );
  assert.equal(result?.canonicalUrl, 'https://www.instagram.com/p/FIRST_1/');
  assert.equal(removeStandaloneInstagramUrl('https://instagram.com/p/FIRST_1/', result), '');
  assert.equal(
    removeStandaloneInstagramUrl('Min tekst https://instagram.com/p/FIRST_1/', result),
    'Min tekst https://instagram.com/p/FIRST_1/',
  );
});

test('rejects spoofed hosts, credentials, ports, non-HTTPS and unsupported routes', () => {
  const invalid = [
    'http://www.instagram.com/p/ABCDE/',
    'https://instagram.com.evil.test/p/ABCDE/',
    'https://user@instagram.com/p/ABCDE/',
    'https://instagram.com:444/p/ABCDE/',
    'https://www.instagram.com/stories/fcnordsjaelland/123/',
    'https://www.instagram.com/p/a/',
    'https://www.instagram.com/direct/',
    'https://www.instagram.com/share/',
    'https://www.instagram.com/.bad/',
  ];
  for (const value of invalid) assert.equal(parseInstagramUrl(value), null, value);
});

test('feed and database serializers preserve only validated attachment metadata', () => {
  const attachment = parseInstagramUrl('https://instagram.com/reel/ABCDE_12/?igsh=secret');
  assert.ok(attachment);
  const preview = toInstagramLinkPreview(attachment);
  assert.equal(preview.imageUrl, undefined);
  assert.deepEqual(fromInstagramLinkPreview(preview), attachment);

  const databaseValue = toDatabaseExternalShare(attachment);
  assert.deepEqual(fromDatabaseExternalShare(databaseValue), attachment);
  assert.equal(fromDatabaseExternalShare({ ...databaseValue, resource_type: 'profile' }), null);
});

test('normalizes cold and warm native payloads and rejects stale or malformed input', () => {
  const cold = normalizeNativeIncomingShare(
    {
      id: 'cold-1',
      rawText: 'https://instagram.com/p/ABCDE/',
      source: 'android_share_intent',
      receivedAt: new Date(NOW).toISOString(),
    },
    NOW,
  );
  assert.equal(cold?.source, 'android_share_intent');
  assert.equal(cold?.id, 'cold-1');

  const warm = parseNativeIncomingShareJson(
    JSON.stringify({
      id: 'warm-1',
      canonicalUrl: 'https://www.instagram.com/reel/FGHIJ/',
      source: 'ios_share_extension',
      receivedAt: new Date(NOW).toISOString(),
    }),
    NOW,
  );
  assert.equal(warm?.source, 'ios_share_extension');
  assert.equal(
    normalizeNativeIncomingShare(
      {
        rawText: 'https://www.instagram.com/p/ABCDE/',
        receivedAt: new Date(NOW - INCOMING_SHARE_TTL_MS - 1).toISOString(),
      },
      NOW,
    ),
    null,
  );
  assert.equal(parseNativeIncomingShareJson('{invalid', NOW), null);
});

test('deduplicates a repeated share and prevents cross-account presentation', () => {
  const incoming = normalizeNativeIncomingShare(
    {
      id: 'share-1',
      rawText: 'https://www.instagram.com/p/ABCDE/',
      receivedAt: new Date(NOW).toISOString(),
    },
    NOW,
  );
  assert.ok(incoming);
  const first = mergeIncomingShare(null, incoming, 'user-a', NOW);
  const duplicate = mergeIncomingShare(first, { ...incoming, id: 'share-2' }, 'user-a', NOW);
  assert.equal(duplicate.share.id, 'share-1');
  assert.equal(canPresentIncomingShare(first, 'user-a', NOW), true);
  assert.equal(canPresentIncomingShare(first, 'user-b', NOW), false);
  assert.equal(canPresentIncomingShare({ ...first, ownerUserId: null }, 'user-b', NOW), true);
});

test('native configuration declares only text sharing and no media download path', () => {
  const plugin = readWorkspaceFile('plugins/withInstagramShare.js');
  const ios = readWorkspaceFile('plugins/instagram-share/ShareViewController.swift');
  const android = readWorkspaceFile(
    'modules/incoming-share/android/src/main/java/dk/fcnfans/incomingshare/FCNIncomingShareModule.kt',
  );
  const context = readWorkspaceFile('src/state/IncomingShareContext.tsx');
  const chooser = readWorkspaceFile('src/screens/IncomingShareScreen.tsx');
  const feedRenderer = readWorkspaceFile('src/components/cards/FanPostCard.tsx');
  const messageRenderer = readWorkspaceFile('src/screens/ConversationScreen.tsx');
  assert.match(plugin, /android\.intent\.action\.SEND/);
  assert.match(plugin, /android:mimeType': 'text\/plain'/);
  assert.match(plugin, /com\.apple\.security\.application-groups/);
  assert.match(ios, /NSExtensionItem/);
  assert.match(android, /Intent\.EXTRA_TEXT/);
  assert.match(context, /consumePendingNativeShare/);
  assert.match(context, /AsyncStorage\.removeItem/);
  assert.match(chooser, /discardPendingShare/);
  assert.match(feedRenderer, /InstagramEmbedCard/);
  assert.match(messageRenderer, /InstagramEmbedPreview/);
  assert.match(messageRenderer, /item\.externalShare/);
  assert.doesNotMatch(
    `${plugin}\n${ios}\n${android}`,
    /URLSession|DownloadManager|EXTRA_STREAM|service_role|SUPABASE|apikey/i,
  );
});

test('Android identity stays canonical while incoming-share keeps its module namespace', () => {
  const appConfig = JSON.parse(readWorkspaceFile('app.json')) as {
    expo: { scheme: string; android: { package: string } };
  };
  const plugin = readWorkspaceFile('plugins/withInstagramShare.js');
  const moduleGradle = readWorkspaceFile('modules/incoming-share/android/build.gradle');
  const moduleConfig = readWorkspaceFile('modules/incoming-share/expo-module.config.json');
  const moduleSource = readWorkspaceFile(
    'modules/incoming-share/android/src/main/java/dk/fcnfans/incomingshare/FCNIncomingShareModule.kt',
  );
  const loadConfig = createRequire(path.resolve(process.cwd(), 'package.json'))(
    './app.config.js',
  ) as () => {
    scheme: string;
    android: { package: string };
  };
  const previousAppMode = process.env.EXPO_PUBLIC_APP_MODE;
  const previousSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const previousSupabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const { productionConfig, demoConfig } = (() => {
    try {
      delete process.env.EXPO_PUBLIC_APP_MODE;
      const production = loadConfig();
      process.env.EXPO_PUBLIC_APP_MODE = 'demo';
      return { productionConfig: production, demoConfig: loadConfig() };
    } finally {
      if (previousAppMode === undefined) delete process.env.EXPO_PUBLIC_APP_MODE;
      else process.env.EXPO_PUBLIC_APP_MODE = previousAppMode;
      if (previousSupabaseUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      else process.env.EXPO_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
      if (previousSupabaseKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = previousSupabaseKey;
    }
  })();

  assert.equal(appConfig.expo.android.package, 'dk.fanbase.fcnfans');
  assert.equal(appConfig.expo.scheme, 'fcnfans');
  assert.equal(productionConfig.android.package, 'dk.fanbase.fcnfans');
  assert.equal(productionConfig.scheme, 'fcnfans');
  assert.equal(demoConfig.android.package, 'dk.fanbase.fcnfans.demo');
  assert.equal(demoConfig.scheme, 'fcnfans-demo');
  assert.match(plugin, /android\.intent\.action\.SEND/);
  assert.match(plugin, /android:mimeType': 'text\/plain'/);
  assert.match(moduleGradle, /namespace 'dk\.fcnfans\.incomingshare'/);
  assert.match(moduleConfig, /dk\.fcnfans\.incomingshare\.FCNIncomingShareModule/);
  assert.match(moduleSource, /package dk\.fcnfans\.incomingshare/);
});

test('migration validates URLs server-side and preserves the legacy send RPC', () => {
  const migration = readWorkspaceFile(
    'supabase/migrations/20260811120000_add_instagram_sharing_v1.sql',
  );
  assert.match(migration, /is_valid_instagram_external_share/);
  assert.match(migration, /create or replace function public\.send_message_v2/);
  assert.doesNotMatch(migration, /drop function if exists public\.send_message\(/);
  assert.match(migration, /direct_message_users_blocked/);
  assert.match(migration, /messages_sender_client_unique/);
  assert.match(migration, /revoke all on function public\.send_message_v2/);
});
