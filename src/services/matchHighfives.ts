import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

function isDuplicateHighfiveError(error: unknown): boolean {
  const code = (error as any)?.code;
  const message = String((error as any)?.message ?? '').toLowerCase();

  return code === '23505' || message.includes('duplicate key') || message.includes('unique constraint');
}

export async function fetchSentMatchHighfives({
  matchId,
  fromUserId,
  toUserIds,
}: {
  matchId: string;
  fromUserId: string;
  toUserIds: string[];
}): Promise<string[]> {
  const uniqueToUserIds = Array.from(new Set(toUserIds.filter((userId) => userId && userId !== fromUserId)));

  if (!matchId || !fromUserId || uniqueToUserIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('match_highfives')
    .select('to_user_id')
    .eq('match_id', matchId)
    .eq('from_user_id', fromUserId)
    .in('to_user_id', uniqueToUserIds);

  if (error) {
    logger.error('[matchHighfives] Error loading sent highfives:', error);
    throw error;
  }

  return (data ?? [])
    .map((row: { to_user_id: string | null }) => row.to_user_id)
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

  const { error } = await supabase.from('match_highfives').insert({
    match_id: matchId,
    from_user_id: fromUserId,
    to_user_id: toUserId,
  });

  if (!error) {
    return;
  }

  if (isDuplicateHighfiveError(error)) {
    return;
  }

  logger.error('[matchHighfives] Error creating highfive:', error);
  throw error;
}
