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
  media?: Array<{ 
    bucket?: string; 
    path?: string; 
    // Legacy fields
    url?: string; 
    publicUrl?: string; 
    type?: 'image' | 'video'; 
    width?: number; 
    height?: number 
  }>;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
}
