export interface Post {
  id: string;
  authorName: string;
  authorId?: string;
  authorAvatarColor?: string;
  communityName?: string;
  factionName?: string;
  communityId?: string | null;
  createdAt: string;
  text: string;
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
