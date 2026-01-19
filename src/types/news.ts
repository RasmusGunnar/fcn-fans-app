export interface NewsItem {
  id: string;
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  createdBy: string;
  actorType: 'user' | 'community';
  actorId: string;
  actorName: string; // Display name (user email or community name)
  communityId?: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

export interface Actor {
  type: 'user' | 'community';
  id: string;
  name: string;
}
