import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { isDemoMode } from '../config/appMode';
import { getDemoPollVotes, voteInDemoPoll } from '../demo/interactions';

type PollVoteRow = {
  post_id: string;
  option_id: string;
  user_id: string;
};

export type PollVotesMap = {
  [postId: string]: {
    optionVotes: {
      [optionId: string]: number;
    };
    voters: {
      [optionId: string]: string[];
    };
  };
};

export async function votePoll(postId: string, optionId: string): Promise<boolean> {
  if (!postId || !optionId) {
    return false;
  }

  if (isDemoMode) return voteInDemoPoll(postId, optionId);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    if (__DEV__ && userError) {
      logger.warn('[votePoll] Failed to get current user:', userError);
    }
    return false;
  }

  const { error } = await supabase.from('poll_votes').insert({
    post_id: postId,
    option_id: optionId,
    user_id: user.id,
  });

  if (error) {
    if ((error as any)?.code === '23505') {
      return true;
    }

    logger.error('[votePoll] Insert error:', error);
    return false;
  }

  return true;
}

export async function fetchPollVotes(postIds: string[]): Promise<PollVotesMap> {
  if (postIds.length === 0) {
    return {};
  }

  if (isDemoMode) return getDemoPollVotes(postIds) as PollVotesMap;

  const { data, error } = await supabase
    .from('poll_votes')
    .select('post_id, option_id, user_id')
    .in('post_id', postIds);

  if (error) {
    if (__DEV__) {
      logger.warn('[fetchPollVotes] Select error:', error);
    }
    return {};
  }

  const result: PollVotesMap = {};

  ((data as PollVoteRow[]) || []).forEach((row) => {
    if (!result[row.post_id]) {
      result[row.post_id] = {
        optionVotes: {},
        voters: {},
      };
    }

    const optionVotes = result[row.post_id].optionVotes;
    const voters = result[row.post_id].voters;

    optionVotes[row.option_id] = (optionVotes[row.option_id] || 0) + 1;

    if (!voters[row.option_id]) {
      voters[row.option_id] = [];
    }

    voters[row.option_id].push(row.user_id);
  });

  return result;
}
