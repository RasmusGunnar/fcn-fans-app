export interface PollOption {
  id: string;
  text: string;
}

export interface PollData {
  question: string;
  options: PollOption[];
  duration: number;
  expires_at: string;
}

export type PostLinkProvider = 'instagram' | 'facebook' | 'youtube' | 'generic';

export interface PostLinkPreview {
  url: string;
  provider: PostLinkProvider;
  domain: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  hasVideo?: boolean | null;
  dismissed?: boolean | null;
}

export interface Post {
  id: string;
  authorName: string;
  authorId?: string;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
  authorFanLevelKey?: import('./fan').FanLevelKey | null;
  actorType?: 'user' | 'community';
  actorId?: string;
  actorDisplayName?: string | null;
  actorAvatarUrl?: string | null;
  authorAvatarColor?: string;
  communityName?: string;
  factionName?: string;
  communityId?: string | null;
  feedTargets?: string[];
  createdAt: string;
  text: string;
  poll_data?: PollData | null;
  linkPreview?: PostLinkPreview | null;
  imageUri?: string;
  media?: {
    bucket?: string;
    path?: string;
    // Legacy fields
    url?: string;
    publicUrl?: string;
    type?: 'image' | 'video';
    width?: number;
    height?: number;
  }[];
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
}
