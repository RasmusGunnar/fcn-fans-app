import { supabase } from '../lib/supabase';

export type WeeklyRankingData = {
  rank: number | null;
  score: number;
  totalUsers: number;
};

export async function fetchWeeklyRanking(): Promise<WeeklyRankingData | null> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log('[weeklyRanking] getUser result', {
      hasUser: !!user,
      userId: user?.id ?? null,
      userError: userError?.message ?? null,
    });

    if (userError || !user?.id) {
      return null;
    }

    const { data, error } = await supabase.functions.invoke('weekly_ranking', {
      body: { userId: user.id },
    });

    console.log('[weeklyRanking] invoke result', {
      userId: user.id,
      data: data ?? null,
      error: error
        ? {
            name: error.name,
            message: error.message,
            context: (error as { context?: unknown }).context ?? null,
          }
        : null,
    });

    if (error) {
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      rank: typeof data.rank === 'number' ? data.rank : null,
      score: typeof data.score === 'number' ? data.score : 0,
      totalUsers: typeof data.totalUsers === 'number' ? data.totalUsers : 0,
    };
  } catch {
    return null;
  }
}
