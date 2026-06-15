export interface NewsItem {
  id: string;
  url: string;
  title?: string;
  description?: string;
  note?: string; // Optional multiline text (stored in news_items.note column)
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
  sourceName?: string;
  provider?: string;
  faviconUrl?: string;
  iconUrl?: string;
  logoUrl?: string;
  sourceLogoUrl?: string;
  hasVideo?: boolean;
}

export interface Actor {
  type: 'user' | 'community';
  id: string;
  name: string;
  avatarUrl?: string | null;
}
