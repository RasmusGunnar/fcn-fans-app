import React, { createContext, useState, useCallback } from 'react';
import { Post } from '../types/post';
import { NewsItem } from '../types/news';
import { supabase } from '../lib/supabase';
import { normalizeMedia } from '../utils/media';
import { fetchNewsItems } from '../services/newsApi';

// Union type for feed items (can be either Post or NewsItem)
export type FeedItem = (Post & { itemType: 'post' }) | (NewsItem & { itemType: 'news' });

interface FeedContextType {
  posts: Post[];
  feedItems: FeedItem[]; // Combined feed of posts + news
  communityMap: Record<string, string>; // Map of community ID -> name
  addPost: (post: Post) => void;
  fetchPosts: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const FeedContext = createContext<FeedContextType | undefined>(undefined);

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [communityMap, setCommunityMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    let transformedPosts: Post[] = [];
    let newsItems: NewsItem[] = [];

    // Fetch posts in separate try/catch so news_items errors don't block posts
    try {
      const { data: postsData, error: fetchError } = await supabase
        .from('posts')
        .select('id, created_at, author_id, text, media')
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        throw fetchError;
      }

      // Transform DB posts to Post type with normalized media
      transformedPosts = (postsData || []).map((dbPost) => ({
        id: dbPost.id,
        authorName: 'Fan', // TODO: Join with profiles table for real names
        authorId: dbPost.author_id,
        createdAt: dbPost.created_at,
        text: dbPost.text,
        likesCount: 0, // TODO: Add likes support
        commentsCount: 0, // TODO: Count comments
        likedByMe: false,
        media: normalizeMedia(dbPost.media), // Normalize media from DB
      }));

      setPosts(transformedPosts);

      if (__DEV__) {
        console.log('[FeedProvider] Posts fetched:', transformedPosts.length);
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      setError(errorMsg);
      console.error('[FeedProvider] fetchPosts (posts) error:', errorMsg);
      // Don't return - continue to try fetching news
    }

    // Fetch news items in separate try/catch
    try {
      newsItems = await fetchNewsItems(50);
      if (__DEV__) {
        console.log('[FeedProvider] News items fetched:', newsItems.length);
      }

      // Build community map from news items
      const communityIds = newsItems
        .filter((item) => item.actorType === 'community' && item.actorId)
        .map((item) => item.actorId);
      
      if (communityIds.length > 0) {
        const uniqueCommunityIds = [...new Set(communityIds)];
        try {
          const { data: communities, error: commError } = await supabase
            .from('communities')
            .select('id, name')
            .in('id', uniqueCommunityIds);

          if (!commError && communities) {
            const newCommunityMap: Record<string, string> = {};
            communities.forEach((c) => {
              newCommunityMap[c.id] = c.name;
            });
            setCommunityMap(newCommunityMap);
            if (__DEV__) {
              console.log('[FeedProvider] Community map populated:', Object.keys(newCommunityMap).length);
            }
          }
        } catch (e) {
          console.warn('[FeedProvider] Failed to fetch community names:', e);
        }
      }
    } catch (e: any) {
      // News fetch failed, but don't block posts
      console.warn('[FeedProvider] fetchNewsItems failed (will continue with posts only):', e?.message || e);
      newsItems = [];
    }

    // Merge posts and news into combined feed with safe defaults
    try {
      const safePostsArray = transformedPosts ?? [];
      const safeNewsArray = newsItems ?? [];

      const combinedFeed: FeedItem[] = [
        ...safePostsArray.map((post) => ({ ...post, itemType: 'post' as const })),
        ...safeNewsArray.map((news) => ({ ...news, itemType: 'news' as const })),
      ];

      // Sort by created_at descending with guard for missing created_at
      combinedFeed.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

      setFeedItems(combinedFeed);

      if (__DEV__) {
        console.log('[FeedProvider] Combined feed:', {
          postsCount: safePostsArray.length,
          newsCount: safeNewsArray.length,
          totalCount: combinedFeed.length,
        });
      }
    } catch (e: any) {
      console.error('[FeedProvider] Error merging feed:', e?.message || e);
    }

    setLoading(false);
  }, []);

  const addPost = useCallback((post: Post) => {
    if (__DEV__) {
      console.log('[FeedProvider] addPost called:', {
        postId: post.id,
        hasMedia: !!post.media,
        media: post.media,
      });
    }
    
    // Dedupe: if post with same ID exists, replace it; otherwise prepend
    setPosts((prev) => {
      const existingIndex = prev.findIndex((p) => p.id === post.id);
      if (existingIndex >= 0) {
        // Replace existing post
        const updated = [...prev];
        updated[existingIndex] = post;
        return updated;
      }
      // Prepend new post
      return [post, ...prev];
    });

    // Also update feedItems
    setFeedItems((prev) => {
      const feedPost: FeedItem = { ...post, itemType: 'post' };
      const existingIndex = prev.findIndex((item) => item.id === post.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = feedPost;
        return updated;
      }
      // Prepend and re-sort
      const updated = [feedPost, ...prev];
      updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return updated;
    });
  }, []);

  return (
    <FeedContext.Provider value={{ posts, feedItems, communityMap, addPost, fetchPosts, loading, error }}>
      {children}
    </FeedContext.Provider>
  );
}

export function useFeed() {
  const context = React.useContext(FeedContext);
  if (!context) {
    throw new Error('useFeed must be used within FeedProvider');
  }
  return context;
}
