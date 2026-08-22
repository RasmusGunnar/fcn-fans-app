import type { DiscussionPost, DiscussionThread } from '../types/discussion';
import { demoMinutesAgo } from './time';
import { DEMO_USERS } from './users';

export const DEMO_DISCUSSION_THREADS: DiscussionThread[] = [
  {
    id: 'demo-thread-motm',
    slug: 'motm',
    title: 'Hvem var jeres MOTM?',
    description: 'Kampens spiller og de afgørende præstationer.',
    isPinned: true,
    isLocked: false,
    replyCount: 31,
    unreadCount: 4,
    lastPostAt: demoMinutesAgo(18),
    createdAt: demoMinutesAgo(420),
  },
  {
    id: 'demo-thread-lineup',
    slug: 'bedste-startopstilling',
    title: 'Bedste FCN-startopstilling lige nu?',
    description: 'Hvordan skal vi stille op i næste kamp?',
    isPinned: false,
    isLocked: false,
    replyCount: 24,
    unreadCount: 2,
    lastPostAt: demoMinutesAgo(43),
    createdAt: demoMinutesAgo(880),
  },
  {
    id: 'demo-thread-match',
    slug: 'dagens-kamp',
    title: 'Hvad synes I om dagens kamp?',
    description: 'Reaktioner, detaljer og de vigtigste øjeblikke.',
    isPinned: false,
    isLocked: false,
    replyCount: 19,
    unreadCount: 0,
    lastPostAt: demoMinutesAgo(75),
    createdAt: demoMinutesAgo(1100),
  },
  {
    id: 'demo-thread-table',
    slug: 'tabellen',
    title: 'Hvor ender vi i tabellen?',
    description: 'Kom med dit bud på resten af sæsonen.',
    isPinned: false,
    isLocked: false,
    replyCount: 17,
    unreadCount: 1,
    lastPostAt: demoMinutesAgo(130),
    createdAt: demoMinutesAgo(1700),
  },
  {
    id: 'demo-thread-away',
    slug: 'naeste-udebane',
    title: 'Planen til næste udebane',
    description: 'Transport, mødetid og fælles warm-up.',
    isPinned: false,
    isLocked: false,
    replyCount: 14,
    unreadCount: 0,
    lastPostAt: demoMinutesAgo(210),
    createdAt: demoMinutesAgo(2100),
  },
  {
    id: 'demo-thread-atmosphere',
    slug: 'stemning',
    title: 'Hvilken sang skal vi starte med?',
    description: 'Forslag til tribunen på søndag.',
    isPinned: false,
    isLocked: false,
    replyCount: 11,
    unreadCount: 0,
    lastPostAt: demoMinutesAgo(285),
    createdAt: demoMinutesAgo(2450),
  },
];

function discussionPost(
  id: string,
  threadId: string,
  authorIndex: number,
  body: string,
  minutesAgo: number,
  reactions: number,
  replies: DiscussionPost[] = [],
): DiscussionPost {
  const author = DEMO_USERS[authorIndex];
  const createdAt = demoMinutesAgo(minutesAgo);
  return {
    id,
    threadId,
    parentPostId: null,
    authorId: author.id,
    author: { id: author.id, displayName: author.displayName, avatarUrl: author.avatarUrl },
    body,
    createdAt,
    updatedAt: createdAt,
    editedAt: null,
    hiddenAt: null,
    deletedAt: null,
    media: [],
    linkPreview: null,
    reactionCount: reactions,
    likedByMe: false,
    replies,
  };
}

function reply(
  id: string,
  threadId: string,
  parentPostId: string,
  authorIndex: number,
  body: string,
  minutesAgo: number,
): DiscussionPost {
  return {
    ...discussionPost(id, threadId, authorIndex, body, minutesAgo, 1),
    parentPostId,
  };
}

export const DEMO_DISCUSSION_POSTS: Record<string, DiscussionPost[]> = {
  'demo-thread-motm': [
    discussionPost(
      'demo-discussion-motm-1',
      'demo-thread-motm',
      3,
      'Midtbanen for mig. Vandt de vigtige dueller og holdt tempoet oppe.',
      70,
      12,
      [
        reply(
          'demo-discussion-motm-1-r1',
          'demo-thread-motm',
          'demo-discussion-motm-1',
          7,
          'Enig – især anden halvleg var stærk.',
          62,
        ),
      ],
    ),
    discussionPost(
      'demo-discussion-motm-2',
      'demo-thread-motm',
      12,
      'Målmanden. Den redning lige efter pausen ændrede kampen.',
      48,
      9,
    ),
    discussionPost(
      'demo-discussion-motm-3',
      'demo-thread-motm',
      18,
      'Kanten var konstant farlig. Mit valg uden tvivl.',
      18,
      5,
    ),
  ],
  'demo-thread-lineup': [
    discussionPost(
      'demo-discussion-lineup-1',
      'demo-thread-lineup',
      5,
      'Jeg vil beholde samme midtbane og give den unge kant en start.',
      110,
      8,
    ),
    discussionPost(
      'demo-discussion-lineup-2',
      'demo-thread-lineup',
      14,
      'Fire i bagkæden denne gang. Vi skal have ro på de første 20 minutter.',
      43,
      6,
    ),
  ],
  'demo-thread-match': [
    discussionPost(
      'demo-discussion-match-1',
      'demo-thread-match',
      2,
      'Rigtig god reaktion efter pausen. Presset sad meget bedre.',
      125,
      10,
    ),
    discussionPost(
      'demo-discussion-match-2',
      'demo-thread-match',
      9,
      'Tre point og flere gode perioder. Det tager jeg med.',
      75,
      7,
    ),
  ],
  'demo-thread-table': [
    discussionPost(
      'demo-discussion-table-1',
      'demo-thread-table',
      16,
      'Top fire hvis vi holder niveauet hjemme.',
      230,
      6,
    ),
    discussionPost(
      'demo-discussion-table-2',
      'demo-thread-table',
      11,
      'Jeg siger nummer fem – men med mulighed for mere.',
      130,
      4,
    ),
  ],
  'demo-thread-away': [
    discussionPost(
      'demo-discussion-away-1',
      'demo-thread-away',
      6,
      'Togholdet mødes ved spor 7 kl. 10.10.',
      260,
      8,
    ),
    discussionPost(
      'demo-discussion-away-2',
      'demo-thread-away',
      4,
      'Jeg har stadig én plads i bilen fra Farum.',
      210,
      5,
    ),
  ],
  'demo-thread-atmosphere': [
    discussionPost(
      'demo-discussion-song-1',
      'demo-thread-atmosphere',
      13,
      'Start med den korte – så kan hele tribunen være med fra første minut.',
      340,
      9,
    ),
    discussionPost(
      'demo-discussion-song-2',
      'demo-thread-atmosphere',
      19,
      'Helt enig. Gem den lange til spillerne kommer ind.',
      285,
      4,
    ),
  ],
};
