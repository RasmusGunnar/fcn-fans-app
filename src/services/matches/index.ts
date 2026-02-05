import type { Match, MatchProvider } from './MatchProvider';
import { MockMatchProvider } from './MockMatchProvider';

class ApiFootballProvider implements MatchProvider {
  async getMatchById(_matchId: string): Promise<Match | null> {
    return null;
  }

  async getUpcomingMatches(_limit: number): Promise<Match[]> {
    return [];
  }
}

export const matchProvider: MatchProvider = __DEV__
  ? new MockMatchProvider()
  : new ApiFootballProvider();
