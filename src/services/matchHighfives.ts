import { supabase } from '../lib/supabase';
import { sendStadiumReaction } from './stadiumLiveApi';

export async function fetchSentMatchHighfives({
  matchId,
  fromUserId,
  toUserIds,
}: {
  matchId: string;
  fromUserId: string;
  toUserIds: string[];
}): Promise<string[]> {
  const uniqueToUserIds = Array.from(
    new Set(toUserIds.filter((userId) => userId && userId !== fromUserId)),
  );

  if (!matchId || !fromUserId || uniqueToUserIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('social_reactions')
    .select('recipient_user_id')
    .eq('context_type', 'stadium')
    .eq('context_id', matchId)
    .eq('actor_id', fromUserId)
    .eq('reaction_type', 'high_five')
    .in('recipient_user_id', uniqueToUserIds);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row: { recipient_user_id: string | null }) => row.recipient_user_id)
    .filter((userId): userId is string => !!userId);
}

export async function createMatchHighfive({
  matchId,
  fromUserId,
  toUserId,
}: {
  matchId: string;
  fromUserId: string;
  toUserId: string;
}): Promise<void> {
  if (!matchId) throw new Error('Manglende kamp-id');
  if (!fromUserId) throw new Error('Ikke logget ind');
  if (!toUserId) throw new Error('Manglende fan');
  if (fromUserId === toUserId) throw new Error('Du kan ikke highfive dig selv.');

  await sendStadiumReaction({
    eventId: matchId,
    recipientUserId: toUserId,
    reactionType: 'high_five',
  });
}
