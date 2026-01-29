export type Community = {
  id: string;
  name: string;
  municipality?: string;
  type: 'community' | 'fan_faction';
  description?: string;
  memberCount?: number;
  createdAt?: number;
  createdBy?: string;
  owner_id?: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
  avatar_kind?: 'logo' | 'image' | null;
  visibility?: 'public' | 'private';
};

export type Match = {
  id: string;
  opponent: string;
  dateTime: number; // ms since epoch
  homeAway: 'home' | 'away';
  competition?: string;
  venue?: string;
};

export type Event = {
  id: string;
  matchId?: string | null;
  communityId?: string | null;
  visibility: 'community' | 'public';
  title: string;
  locationName: string;
  startTime: number;
  endTime?: number | null;
  soloWelcome?: boolean;
  createdBy: string;
  createdAt: number;
  attendanceCount?: number;
};

export type Message = {
  id: string;
  uid: string;
  text: string;
  createdAt: number;
};
