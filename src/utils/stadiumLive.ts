import type {
  StadiumParticipant,
  StadiumReaction,
  StadiumReactionType,
} from '../types/stadiumLive';

export type StadiumReactionOption = {
  type: StadiumReactionType;
  emoji: string;
  label: string;
  receivedCopy: string;
};

export const STADIUM_REACTION_OPTIONS: readonly StadiumReactionOption[] = [
  { type: 'high_five', emoji: '🙌', label: 'High five', receivedCopy: 'gav dig en high five' },
  { type: 'come_on', emoji: '🔥', label: 'Kom så!', receivedCopy: 'sender Kom så!' },
  { type: 'cheers', emoji: '🍻', label: 'Skål!', receivedCopy: 'skåler med dig' },
  { type: 'fire', emoji: '👏', label: 'Stærkt!', receivedCopy: 'sender Stærkt!' },
  { type: 'heart', emoji: '❤️', label: 'FCN!', receivedCopy: 'sender dig et FCN-hjerte' },
  { type: 'laugh', emoji: '😂', label: 'Haha!', receivedCopy: 'griner med dig' },
] as const;

export function getStadiumReactionOption(type: StadiumReactionType): StadiumReactionOption {
  return (
    STADIUM_REACTION_OPTIONS.find((option) => option.type === type) ?? STADIUM_REACTION_OPTIONS[0]
  );
}

export function getStadiumReactionCopy(
  reaction: Pick<StadiumReaction, 'actorDisplayName' | 'actorUsername' | 'reactionType'>,
): string {
  const option = getStadiumReactionOption(reaction.reactionType);
  const actorName = reaction.actorDisplayName || reaction.actorUsername || 'En fan';
  return `${actorName} ${option.receivedCopy} ${option.emoji}`;
}

export function sanitizeStadiumSection(value: string): string | null {
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, 30);
}

export function splitStadiumParticipants(participants: StadiumParticipant[]): {
  relevant: StadiumParticipant[];
  others: StadiumParticipant[];
} {
  return {
    relevant: participants.filter(
      (participant) => participant.sameCommunity || participant.reactedRecently,
    ),
    others: participants.filter(
      (participant) => !participant.sameCommunity && !participant.reactedRecently,
    ),
  };
}

export function mergeStadiumReactions(
  current: StadiumReaction[],
  incoming: StadiumReaction[],
): StadiumReaction[] {
  const byId = new Map<string, StadiumReaction>();
  [...current, ...incoming].forEach((reaction) => byId.set(reaction.id, reaction));
  return Array.from(byId.values()).sort((left, right) => {
    const createdDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return createdDifference || right.id.localeCompare(left.id);
  });
}

export function getRemainingCooldownSeconds(
  cooldownUntil: string | null,
  now = Date.now(),
): number {
  if (!cooldownUntil) return 0;
  const remainingMs = Date.parse(cooldownUntil) - now;
  return Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0;
}

export function shouldShowIncomingStadiumReaction(
  seenReactionIds: ReadonlySet<string>,
  reactionId: string,
): boolean {
  return reactionId.length > 0 && !seenReactionIds.has(reactionId);
}
