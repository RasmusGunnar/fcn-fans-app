export type MatchStatus = 'scheduled' | 'live' | 'finished' | string;

export type Match = {
  id: string;
  kickoff: string;
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string | null;
  competition?: string | null;
  status?: MatchStatus | null;
};

export interface MatchProvider {
  getMatchById(matchId: string): Promise<Match | null>;
  getUpcomingMatches(limit: number): Promise<Match[]>;
}
