import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { APP_TAB_BAR_BASE_HEIGHT, APP_TAB_BAR_FAB_OVERFLOW } from '../../navigation/tabBarMetrics';
import type { StadiumParticipant, StadiumReaction } from '../../types/stadiumLive';
import {
  applyCheckInSnapshot,
  applyRsvpStatus,
  createInitialMatchdayState,
} from '../../state/matchdayStateCore';
import {
  STADIUM_REACTION_OPTIONS,
  getRemainingCooldownSeconds,
  getStadiumListBottomPadding,
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

test('participant list clears measured tab bars, safe areas, and the shared FAB overflow', () => {
  const fabClearance = APP_TAB_BAR_FAB_OVERFLOW + 4;
  assert.equal(getStadiumListBottomPadding(APP_TAB_BAR_BASE_HEIGHT, fabClearance), 88);
  assert.equal(getStadiumListBottomPadding(APP_TAB_BAR_BASE_HEIGHT + 34, fabClearance), 122);
  assert.equal(getStadiumListBottomPadding(Number.NaN, fabClearance), fabClearance);

  const stadium = readWorkspaceFile('src/screens/StadiumLiveScreen.tsx');
  const tabs = readWorkspaceFile('src/navigation/AppTabs.tsx');
  assert.match(stadium, /useBottomTabBarHeight\(\)/);
  assert.match(stadium, /APP_TAB_BAR_FAB_OVERFLOW \+ theme\.spacing\[1\]/);
  assert.match(stadium, /contentContainerStyle=\{\[styles\.content, \{ paddingBottom:/);
  assert.match(stadium, /scrollIndicatorInsets=\{\{ bottom: tabBarHeight \}\}/);
  assert.match(tabs, /BottomTabBarHeightCallbackContext/);
  assert.match(tabs, /setTabBarHeight\?\.\(event\.nativeEvent\.layout\.height\)/);
  assert.match(tabs, /onLayout=\{handleLayout\}/);
  assert.match(tabs, /top: -APP_TAB_BAR_FAB_OVERFLOW/);
});

test('repair migration uses UUID match ids, RPC-only mutations, active check-ins, and server enforcement', () => {
  const source = readWorkspaceFile('supabase/migrations/20260818120000_repair_stadium_live_v1.sql');
  assert.match(source, /alter column match_id type uuid using match_id::uuid/);
  assert.match(source, /create or replace function public\.set_match_checkin_status/);
  assert.match(source, /on conflict \(match_id, user_id\) do nothing/);
  assert.match(source, /revoke all on table public\.match_checkins from anon, authenticated/);
  assert.doesNotMatch(source, /preference\.is_visible = true/);
  assert.match(source, /checkin\.user_id <> v_user_id/);
  assert.match(source, /not public\.is_stadium_live_blocked/);
  assert.match(source, /interval '30 seconds'/);
  assert.match(source, />= 20/);
  assert.match(source, /perform public\.enqueue_notification/);
  assert.match(source, /p_preference_key => 'stadium_reactions'/);
});

test('shared matchday record updates RSVP, check-in, and check-out for every consumer', () => {
  const initial = createInitialMatchdayState('match-id');
  const rsvp = applyRsvpStatus(initial, 'going');
  assert.equal(rsvp.rsvpStatus, 'going');
  assert.equal(rsvp.attendanceCount, 1);
  assert.equal(rsvp.currentUserParticipationState, 'rsvp_going');

  const checkedIn = applyCheckInSnapshot(rsvp, {
    countCheckedIn: 4,
    avatars: ['avatar'],
    profiles: [],
    userIds: ['other-user'],
    isCheckedIn: true,
    stadiumLiveOpen: true,
    canCheckIn: false,
  });
  assert.equal(checkedIn.isCheckedIn, true);
  assert.equal(checkedIn.participantCount, 4);
  assert.equal(checkedIn.currentUserParticipationState, 'checked_in');

  const checkedOut = applyCheckInSnapshot(checkedIn, {
    countCheckedIn: 3,
    avatars: [],
    profiles: [],
    userIds: [],
    isCheckedIn: false,
    stadiumLiveOpen: true,
    canCheckIn: true,
  });
  assert.equal(checkedOut.isCheckedIn, false);
  assert.equal(checkedOut.participantCount, 3);
  assert.equal(checkedOut.currentUserParticipationState, 'eligible');
  assert.ok(checkedOut.revision > checkedIn.revision);
});

test('Home, Match Details, and Stadium Live use the shared state and canonical Stadium route', () => {
  const home = readWorkspaceFile('src/screens/HomeScreen.tsx');
  const details = readWorkspaceFile('src/screens/MatchDetailsScreen.tsx');
  const stadium = readWorkspaceFile('src/screens/StadiumLiveScreen.tsx');
  const matchdayContext = readWorkspaceFile('src/state/MatchdayStateContext.tsx');
  const eventsStack = readWorkspaceFile('src/navigation/EventsStack.tsx');
  assert.match(home, /useMatchdayState/);
  assert.match(details, /useMatchdayState/);
  assert.match(stadium, /useMatchdayState/);
  assert.match(home, /navigateToStadiumLive/);
  assert.match(details, /navigateToStadiumLive/);
  assert.doesNotMatch(eventsStack, /name="StadiumLive"/);
  assert.doesNotMatch(stadium, /Bliv synlig for andre fans/);
  assert.match(stadium, /Check ud/);
  assert.match(stadium, /Du er den første her/);
  assert.match(stadium, /variant="ghost"/);
  assert.match(stadium, /accessibilityRole="switch"/);
  assert.match(stadium, /reactionControlDisabled/);
  assert.match(stadium, /sectionEditorVisible/);
  assert.match(stadium, /if \(!sectionEditorVisibleRef\.current\)/);
  assert.match(stadium, /sectionEditorVisibleRef\.current = true/);
  assert.match(stadium, /reactionsEnabled: !preferences\.reactionsEnabled/);
  assert.match(stadium, /sectionLabel: sanitizeStadiumSection\(sectionDraft\)/);
  assert.doesNotMatch(stadium, /Stadion Live-indstillinger/);
  assert.match(matchdayContext, /activeUserIdRef\.current !== requestedUserId/);
  assert.match(matchdayContext, /recordsRef\.current = \{\}/);
});

test('Stadium keeps participant actions and adds local reaction confirmation only', () => {
  const screen = readWorkspaceFile('src/screens/StadiumLiveScreen.tsx');
  const row = readWorkspaceFile('src/components/stadium/StadiumParticipantRow.tsx');
  assert.match(screen, /reaction\.received\)\.slice\(0, 2\)/);
  assert.match(screen, /setSentReaction\(\{ userId: participant\.userId, reactionType \}\)/);
  assert.match(screen, /setInterval\(tickCooldowns, COOLDOWN_TICK_MS\)/);
  assert.match(screen, /void load\(\{ refresh: true \}\)/);
  assert.match(screen, /↔ I har reageret på hinanden/);
  assert.match(row, /sentReactionType/);
  assert.match(row, /Sendt/);
  assert.match(row, /onProfile/);
  assert.match(row, /onMessage/);
  assert.match(row, /Samme fællesskab/);
  assert.match(row, /participant\.avatarUrl/);
});

test('known participant avatars resolve before the first paint', () => {
  const avatar = readWorkspaceFile('src/components/Avatar.tsx');
  assert.doesNotMatch(avatar, /useState<string \| null>\(null\)/);
  assert.match(avatar, /useState<AvatarResolution>\(\(\) =>\s*createInitialAvatarResolution/);
  assert.match(avatar, /resolution\.cacheKey === cacheKey/);
  assert.match(avatar, /const cachedUri = pathCache\.get\(cacheKey\)/);
  assert.match(avatar, /committedRequestKeyRef\.current !== requestKey/);
  assert.match(avatar, /event\.nativeEvent\.source\.uri/);
  assert.match(avatar, /key=\{requestKey\}/);
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
