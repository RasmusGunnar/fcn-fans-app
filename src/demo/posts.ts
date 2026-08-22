import type { CommentPreview } from '../services/likesApi';
import type { Post, PollData } from '../types/post';
import { DEMO_COMMUNITIES, DEMO_COMMUNITY_IDS } from './communities';
import { DEMO_MEDIA_FILES, demoMediaUrl } from './media';
import { demoDaysFromNow, demoMinutesAgo } from './time';
import { DEMO_USERS } from './users';

type DemoPostOptions = {
  communityId?: string;
  mediaFile?: (typeof DEMO_MEDIA_FILES)[keyof typeof DEMO_MEDIA_FILES];
  videoPreview?: boolean;
  poll?: PollData;
};

function createDemoPost(
  number: number,
  authorIndex: number,
  minutesAgo: number,
  text: string,
  likesCount: number,
  commentsCount: number,
  options: DemoPostOptions = {},
): Post {
  const author = DEMO_USERS[authorIndex];
  const community = options.communityId
    ? DEMO_COMMUNITIES.find((item) => item.id === options.communityId)
    : null;

  return {
    id: `demo-post-${String(number).padStart(2, '0')}`,
    postType: 'post',
    authorName: author.displayName,
    authorId: author.id,
    authorDisplayName: author.displayName,
    authorAvatarUrl: author.avatarUrl,
    authorFanLevelKey: author.fanLevelKey,
    actorType: 'user',
    actorId: author.id,
    actorDisplayName: author.displayName,
    actorAvatarUrl: author.avatarUrl,
    communityName: community?.name,
    communityId: community?.id ?? null,
    feedTargets: community ? ['home', `community:${community.id}`] : ['home'],
    createdAt: demoMinutesAgo(minutesAgo),
    text,
    poll_data: options.poll ?? null,
    linkPreview: null,
    media: options.mediaFile
      ? [
          {
            url: demoMediaUrl(options.mediaFile),
            type: 'image',
            width: 1600,
            height: 1067,
            demoVideoPreview: options.videoPreview === true,
          },
        ]
      : [],
    likesCount,
    commentsCount,
    likedByMe: false,
  };
}

const pointsPoll: PollData = {
  question: 'Hvor mange point tager FCN i de næste tre kampe?',
  options: [
    { id: 'poll-points-9', text: '9 point' },
    { id: 'poll-points-7', text: '7 point' },
    { id: 'poll-points-4-6', text: '4–6 point' },
    { id: 'poll-points-less', text: 'Mindre end 4' },
  ],
  duration: 7,
  expires_at: demoDaysFromNow(7),
};

const playerPoll: PollData = {
  question: 'Hvem bliver kampens spiller?',
  options: [
    { id: 'poll-player-midfield', text: 'Den centrale midtbane' },
    { id: 'poll-player-wing', text: 'Kanten' },
    { id: 'poll-player-keeper', text: 'Målmanden' },
    { id: 'poll-player-striker', text: 'Angriberen' },
  ],
  duration: 3,
  expires_at: demoDaysFromNow(3),
};

const awayMeetPoll: PollData = {
  question: 'Hvordan kommer du til næste udekamp?',
  options: [
    { id: 'poll-away-train', text: 'Tog' },
    { id: 'poll-away-car', text: 'Bil' },
    { id: 'poll-away-bus', text: 'Fælles bus' },
  ],
  duration: 5,
  expires_at: demoDaysFromNow(5),
};

export const DEMO_POSTS: Post[] = [
  createDemoPost(1, 2, 12, 'Så er warm-up i gang! 🔥🔴🟡', 42, 13, {
    communityId: DEMO_COMMUNITY_IDS.tifo,
    mediaFile: DEMO_MEDIA_FILES.warmup,
    videoPreview: true,
  }),
  createDemoPost(2, 6, 37, 'Viborg away! 🔴🟡\nHvem tager toget fra København?', 23, 18, {
    communityId: DEMO_COMMUNITY_IDS.away,
    mediaFile: DEMO_MEDIA_FILES.awayTrip,
  }),
  createDemoPost(
    3,
    2,
    64,
    'Nogen der kører fra Ganløse til kampen på søndag? Vi er tre og har plads til én mere 🔴🟡',
    11,
    6,
    { communityId: DEMO_COMMUNITY_IDS.ganlose },
  ),
  createDemoPost(
    4,
    4,
    91,
    'Når FCN scorer til 2-1, mens man sidder i sommerhus i Rørvig 😂🔥',
    38,
    9,
    { mediaFile: DEMO_MEDIA_FILES.rorvigGoal, videoPreview: true },
  ),
  createDemoPost(5, 11, 126, 'KOM SÅ FCN! ❤️💛 Hele tribunen er klar.', 31, 7, {
    mediaFile: DEMO_MEDIA_FILES.stand,
  }),
  createDemoPost(6, 8, 158, '', 19, 5, { poll: pointsPoll }),
  createDemoPost(7, 5, 205, 'Skal vi samle folk til fælles warm-up før kampen?', 17, 12, {
    communityId: DEMO_COMMUNITY_IDS.away,
  }),
  createDemoPost(
    8,
    14,
    244,
    'Jeg tager det store banner med. Er der nogen der kan hjælpe med at få det ind?',
    14,
    8,
    { communityId: DEMO_COMMUNITY_IDS.away },
  ),
  createDemoPost(9, 7, 290, 'Næste stop: udebanen 💪', 27, 4, {
    mediaFile: DEMO_MEDIA_FILES.awayTrip,
  }),
  createDemoPost(10, 1, 338, 'Nogen der er med på en øl ved stadion inden kampen?', 8, 2, {
    communityId: DEMO_COMMUNITY_IDS.ganlose,
  }),
  createDemoPost(11, 16, 390, '', 21, 6, { poll: playerPoll }),
  createDemoPost(
    12,
    3,
    465,
    'Hjemtransport – er der nogen med to ledige pladser efter kampen?',
    9,
    7,
    { communityId: DEMO_COMMUNITY_IDS.away },
  ),
  createDemoPost(13, 17, 535, 'Tre point med hjem! 🙌', 36, 10, {
    mediaFile: DEMO_MEDIA_FILES.afterMatch,
  }),
  createDemoPost(
    14,
    9,
    610,
    'Nyt sangforslag til søndag – kort, simpelt og højt. Hvem er med?',
    12,
    3,
    {
      communityId: DEMO_COMMUNITY_IDS.tifo,
    },
  ),
  createDemoPost(15, 13, 690, 'Vi mødes ved stationen 16.05 og går samlet mod stadion.', 7, 1, {
    communityId: DEMO_COMMUNITY_IDS.farum,
  }),
  createDemoPost(16, 10, 780, '', 15, 4, {
    communityId: DEMO_COMMUNITY_IDS.away,
    poll: awayMeetPoll,
  }),
  createDemoPost(17, 18, 930, 'Flagene er pakket. Nu mangler vi bare søndag 🔴🟡', 18, 2, {
    communityId: DEMO_COMMUNITY_IDS.tifo,
  }),
  createDemoPost(18, 12, 1120, 'Mit bud: 2-1. Den bliver tæt, men vi tager den til sidst.', 6, 5),
  createDemoPost(
    19,
    15,
    1320,
    'To ekstra billetter samlet på langsiden – skriv hvis I mangler.',
    3,
    0,
    {
      communityId: DEMO_COMMUNITY_IDS.farum,
    },
  ),
  createDemoPost(20, 19, 1540, 'Morgenturen i FCN-trøjen. Kampdag kan godt begynde tidligt.', 8, 2),
];

export type DemoCommentRecord = CommentPreview & {
  target_type: 'post' | 'news' | 'event' | 'match' | 'bus_trip';
  target_id: string;
  parent_id: string | null;
  like_count: number;
  liked_by_me: boolean;
};

function demoComment(
  id: string,
  targetType: DemoCommentRecord['target_type'],
  targetId: string,
  authorIndex: number,
  text: string,
  minutesAgo: number,
  parentId: string | null = null,
  likes = 0,
): DemoCommentRecord {
  const author = DEMO_USERS[authorIndex];
  return {
    id,
    target_type: targetType,
    target_id: targetId,
    parent_id: parentId,
    author_id: author.id,
    text,
    created_at: demoMinutesAgo(minutesAgo),
    author_display_name: author.displayName,
    author_avatar_url: author.avatarUrl,
    like_count: likes,
    liked_by_me: false,
  };
}

export const DEMO_COMMENTS: DemoCommentRecord[] = [
  demoComment(
    'demo-comment-ganlose-1',
    'post',
    'demo-post-03',
    1,
    'Vi kører nok omkring 16.15.',
    59,
    null,
    3,
  ),
  demoComment(
    'demo-comment-ganlose-2',
    'post',
    'demo-post-03',
    3,
    'Kan godt bruge en plads hvis den stadig er ledig 🙌',
    52,
    null,
    2,
  ),
  demoComment(
    'demo-comment-ganlose-3',
    'post',
    'demo-post-03',
    2,
    'Yes, sender dig lige en besked.',
    47,
    'demo-comment-ganlose-2',
    1,
  ),
  demoComment(
    'demo-comment-away-1',
    'post',
    'demo-post-02',
    1,
    'Vi tager 10.23 fra København H.',
    34,
    null,
    6,
  ),
  demoComment(
    'demo-comment-away-2',
    'post',
    'demo-post-02',
    8,
    'Vi hopper på i Høje Taastrup.',
    31,
    null,
    4,
  ),
  demoComment(
    'demo-comment-away-3',
    'post',
    'demo-post-02',
    11,
    'Hvor mødes vi i Viborg?',
    28,
    null,
    2,
  ),
  demoComment(
    'demo-comment-away-4',
    'post',
    'demo-post-02',
    6,
    'Skal vi ikke bare tage samme pub som sidst?',
    24,
    'demo-comment-away-3',
    5,
  ),
  demoComment(
    'demo-comment-away-5',
    'post',
    'demo-post-02',
    4,
    'Jeg har to ekstra pladser i bilen fra Farum.',
    21,
    null,
    7,
  ),
  demoComment(
    'demo-comment-away-6',
    'post',
    'demo-post-02',
    13,
    'Jeg napper gerne den ene plads.',
    18,
    'demo-comment-away-5',
    1,
  ),
  demoComment(
    'demo-comment-warmup-1',
    'post',
    'demo-post-01',
    7,
    'Det ser stærkt ud allerede!',
    9,
    null,
    4,
  ),
  demoComment(
    'demo-comment-warmup-2',
    'post',
    'demo-post-01',
    14,
    'Vi er på vej ned mod jer 🔥',
    6,
    null,
    2,
  ),
  demoComment(
    'demo-comment-rorvig-1',
    'post',
    'demo-post-04',
    5,
    'Hele sommerhuset kunne høre jer 😂',
    58,
    null,
    3,
  ),
  demoComment(
    'demo-comment-match-1',
    'match',
    'demo-match-next',
    3,
    'Mit bud er 2-1 til FCN.',
    44,
    null,
    2,
  ),
  demoComment(
    'demo-comment-match-2',
    'match',
    'demo-match-next',
    9,
    'Hvem mødes ved fanbaren før kamp?',
    36,
    null,
    4,
  ),
  demoComment(
    'demo-comment-match-3',
    'match',
    'demo-match-next',
    15,
    'Vi er fire der kommer omkring 16.30.',
    29,
    'demo-comment-match-2',
    1,
  ),
];

export const DEMO_ENGAGEMENT: Record<string, { liked: boolean; likes: number; comments: number }> =
  Object.fromEntries(
    DEMO_POSTS.map((post) => [
      `post:${post.id}`,
      { liked: false, likes: post.likesCount, comments: post.commentsCount },
    ]),
  );

export function getDemoPostsForCommunity(communityId: string): Post[] {
  return DEMO_POSTS.filter((post) => post.feedTargets?.includes(`community:${communityId}`));
}

export function getDemoCommentPreviews(targetType: string, targetId: string): CommentPreview[] {
  return DEMO_COMMENTS.filter(
    (comment) =>
      comment.target_type === targetType &&
      comment.target_id === targetId &&
      comment.parent_id === null,
  )
    .slice(-2)
    .map(
      ({
        target_type: _targetType,
        target_id: _targetId,
        parent_id: _parent,
        like_count: _likes,
        liked_by_me: _liked,
        ...comment
      }) => comment,
    );
}
