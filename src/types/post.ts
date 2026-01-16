export interface Post {
  id: string;
  authorName: string;
  authorId?: string;
  authorAvatarColor?: string;
  communityName?: string;
  factionName?: string;
  createdAt: string;
  text: string;
  imageUri?: string;
  media?: Array<{ url?: string; publicUrl?: string; path?: string; type?: 'image' | 'video'; width?: number; height?: number }>;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
}
