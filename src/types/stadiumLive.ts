export type StadiumReactionType = 'high_five' | 'come_on' | 'cheers' | 'fire' | 'heart' | 'laugh';

export type StadiumLivePreferences = {
  isVisible: boolean;
  reactionsEnabled: boolean;
  sectionLabel: string | null;
  updatedAt: string | null;
};

export type StadiumParticipant = {
  userId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  fanLevelKey: string | null;
  sectionLabel: string | null;
  sameCommunity: boolean;
  reactedRecently: boolean;
  canReact: boolean;
  canMessage: boolean;
  rankBucket: number;
};

export type StadiumParticipantPage = {
  participants: StadiumParticipant[];
  totalCount: number;
  nextCursor: { rank: number; userId: string } | null;
};

export type StadiumReaction = {
  id: string;
  eventId: string;
  actorId: string;
  recipientUserId: string;
  reactionType: StadiumReactionType;
  replyToReactionId: string | null;
  createdAt: string;
  actorDisplayName: string | null;
  actorUsername: string | null;
  actorAvatarUrl: string | null;
  received: boolean;
  replied: boolean;
};

export type SentStadiumReaction = {
  id: string;
  createdAt: string;
  cooldownUntil: string;
};
