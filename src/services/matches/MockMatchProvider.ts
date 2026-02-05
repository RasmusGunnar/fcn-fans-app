import type { Match, MatchProvider } from './MatchProvider';

const mockMatches: Match[] = [
  {
    id: 'match-001',
    kickoff: '2026-02-09T18:00:00.000Z',
    homeTeamName: 'FC Nordsjælland',
    awayTeamName: 'Brøndby IF',
    venueName: 'Right to Dream Park',
    competition: 'Superligaen',
    status: 'scheduled',
  },
  {
    id: 'match-002',
    kickoff: '2026-02-16T16:00:00.000Z',
    homeTeamName: 'FC Midtjylland',
    awayTeamName: 'FC Nordsjælland',
    venueName: 'MCH Arena',
    competition: 'Superligaen',
    status: 'scheduled',
  },
  {
    id: 'match-003',
    kickoff: '2026-02-23T19:00:00.000Z',
    homeTeamName: 'FC Nordsjælland',
    awayTeamName: 'AGF',
    venueName: 'Ceres Park',
    competition: 'Superligaen',
    status: 'scheduled',
  },
];

export class MockMatchProvider implements MatchProvider {
  async getMatchById(matchId: string): Promise<Match | null> {
    return mockMatches.find((match) => match.id === matchId) ?? null;
  }

  async getUpcomingMatches(limit: number): Promise<Match[]> {
    return mockMatches.slice(0, Math.max(0, limit));
  }
}
