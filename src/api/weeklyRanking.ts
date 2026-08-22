import { supabase } from '../lib/supabase';
import { isDemoMode } from '../config/appMode';

export type WeeklyRankingData = {
  rank: number | null;
  score: number;
  totalUsers: number;
};

export async function fetchWeeklyRanking(): Promise<WeeklyRankingData | null> {
  if (isDemoMode) return { rank: 12, score: 86, totalUsers: 248 };
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

    const { data, error } = await supabase.functions.invoke('weekly_ranking');

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
      return {
        rank: null,
        score: 0,
        totalUsers: 0,
      };
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
