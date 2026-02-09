import type { Match, MatchProvider } from './MatchProvider';
import { fetchFixtureById, fetchMatchesUpcoming } from '../eventsApi';

function toMatch(fixture: any): Match {
  return {
    id: fixture.id,
    kickoff: fixture.kickoff_at,
    homeTeamName: fixture.home_team,
    awayTeamName: fixture.away_team,
    venueName: fixture.venue ?? null,
    competition: fixture.competition ?? null,
    status: fixture.status_short ?? null,
  };
}

class SupabaseMatchProvider implements MatchProvider {
  async getMatchById(matchId: string): Promise<Match | null> {
    const fixture = await fetchFixtureById(matchId);
    return fixture ? toMatch(fixture) : null;
  }

  async getUpcomingMatches(limit: number): Promise<Match[]> {
    const fixtures = await fetchMatchesUpcoming(limit);
    return fixtures.map((fixture) => toMatch(fixture));
  }
}

export const matchProvider: MatchProvider = new SupabaseMatchProvider();
