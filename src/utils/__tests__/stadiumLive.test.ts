import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { StadiumParticipant, StadiumReaction } from '../../types/stadiumLive';
import {
  STADIUM_REACTION_OPTIONS,
  getRemainingCooldownSeconds,
  getStadiumReactionCopy,
  mergeStadiumReactions,
  sanitizeStadiumSection,
  shouldShowIncomingStadiumReaction,
  splitStadiumParticipants,
} from '../stadiumLive';

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function participant(
  userId: string,
  override: Partial<StadiumParticipant> = {},
): StadiumParticipant {
  return {
    userId,
    displayName: `Fan ${userId}`,
    username: null,
    avatarUrl: null,
    fanLevelKey: null,
    sectionLabel: null,
    sameCommunity: false,
    reactedRecently: false,
    canReact: true,
    canMessage: true,
    rankBucket: 2,
    ...override,
  };
}

function reaction(id: string, createdAt: string): StadiumReaction {
  return {
    id,
    eventId: 'event-id',
    actorId: 'actor-id',
    recipientUserId: 'recipient-id',
    reactionType: 'high_five',
    replyToReactionId: null,
    createdAt,
    actorDisplayName: 'Mikkel',
    actorUsername: null,
    actorAvatarUrl: null,
    received: true,
    replied: false,
  };
}

test('stadium reactions expose the six allowlisted labels and default high five', () => {
  assert.deepEqual(
    STADIUM_REACTION_OPTIONS.map((option) => option.type),
    ['high_five', 'come_on', 'cheers', 'fire', 'heart', 'laugh'],
  );
  assert.match(getStadiumReactionCopy(reaction('one', '2026-08-10T10:00:00Z')), /high five/);
});

test('community and prior-reaction participants are separated from other fans', () => {
  const split = splitStadiumParticipants([
    participant('community', { sameCommunity: true, rankBucket: 0 }),
    participant('reaction', { reactedRecently: true, rankBucket: 1 }),
    participant('other'),
  ]);
  assert.deepEqual(
    split.relevant.map((item) => item.userId),
    ['community', 'reaction'],
  );
  assert.deepEqual(
    split.others.map((item) => item.userId),
    ['other'],
  );
});

test('section labels are control-free, whitespace-normalized, and capped at 30 characters', () => {
  assert.equal(sanitizeStadiumSection('  A\n  tribunen  '), 'A tribunen');
  assert.equal(sanitizeStadiumSection('   '), null);
  assert.equal(sanitizeStadiumSection('x'.repeat(40))?.length, 30);
});

test('reaction reconciliation deduplicates ids and keeps newest first', () => {
  const older = reaction('older', '2026-08-10T10:00:00Z');
  const newer = reaction('newer', '2026-08-10T10:01:00Z');
  assert.deepEqual(
    mergeStadiumReactions([older], [older, newer]).map((item) => item.id),
    ['newer', 'older'],
  );
  assert.equal(shouldShowIncomingStadiumReaction(new Set(['older']), 'older'), false);
  assert.equal(shouldShowIncomingStadiumReaction(new Set(['older']), 'newer'), true);
});

test('cooldown UI rounds up remaining seconds and clears expired values', () => {
  const now = Date.parse('2026-08-10T10:00:00Z');
  assert.equal(getRemainingCooldownSeconds('2026-08-10T10:00:30Z', now), 30);
  assert.equal(getRemainingCooldownSeconds('2026-08-10T09:59:59Z', now), 0);
});

test('migration keeps hidden, self, block, rate-limit, and outbox enforcement server-side', () => {
  const source = readWorkspaceFile('supabase/migrations/20260810120000_add_stadium_live.sql');
  assert.match(source, /preference\.is_visible = true/);
  assert.match(source, /checkin\.user_id <> v_user_id/);
  assert.match(source, /not public\.is_stadium_live_blocked/);
  assert.match(source, /interval '30 seconds'/);
  assert.match(source, />= 20/);
  assert.match(source, /perform public\.enqueue_notification/);
  assert.match(source, /p_preference_key => 'stadium_reactions'/);
});

test('screen and provider preserve reply, DM, profile, realtime, and account reset wiring', () => {
  const screen = readWorkspaceFile('src/screens/StadiumLiveScreen.tsx');
  const provider = readWorkspaceFile('src/state/StadiumReactionContext.tsx');
  const navigation = readWorkspaceFile('src/navigation/navigationRef.ts');
  const queueWorker = readWorkspaceFile('supabase/functions/process_push_queue/index.ts');
  const pushBootstrap = readWorkspaceFile('src/components/PushNotificationsBootstrap.tsx');
  assert.match(screen, /replyToReactionId: latestReaction\.id|handleReply\(reaction\)/);
  assert.match(screen, /createOrGetDirectConversation\(participant\.userId\)/);
  assert.match(screen, /navigation\.navigate\('PublicProfile'/);
  assert.match(provider, /filter: `recipient_user_id=eq\.\$\{user\.id\}`/);
  assert.match(provider, /seenIdsRef\.current\.clear\(\)/);
  assert.match(navigation, /targetType === 'stadium_reaction'[\s\S]*navigateToStadiumLive/);
  assert.match(queueWorker, /getStadiumReactionSkipReason[\s\S]*stadium_reactions/);
  assert.match(queueWorker, /stadium_reaction_recipient_opted_out/);
  assert.match(pushBootstrap, /data\?\.type !== 'stadium_reaction'/);
});
