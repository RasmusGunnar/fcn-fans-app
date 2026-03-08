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

export interface Post {
  id: string;
  authorName: string;
  authorId?: string;
  actorType?: 'user' | 'community';
  actorId?: string;
  authorAvatarColor?: string;
  communityName?: string;
  factionName?: string;
  communityId?: string | null;
  feedTargets?: string[];
  createdAt: string;
  text: string;
  poll_data?: PollData | null;
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
