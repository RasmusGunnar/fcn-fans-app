import React, { createContext, useState, useCallback } from 'react';
import { Post } from '../types/post';
import { supabase } from '../lib/supabase';
import { normalizeMedia } from '../utils/media';

interface FeedContextType {
  posts: Post[];
  addPost: (post: Post) => void;
  fetchPosts: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const FeedContext = createContext<FeedContextType | undefined>(undefined);

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('posts')
        .select('id, created_at, author_id, text, media')
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        throw fetchError;
      }

      // Transform DB posts to Post type with normalized media
      const transformedPosts: Post[] = (data || []).map((dbPost) => ({
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
        console.log('[FeedProvider] fetchPosts success:', {
          count: transformedPosts.length,
          firstPost: transformedPosts[0],
        });
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      setError(errorMsg);
      console.error('[FeedProvider] fetchPosts error:', errorMsg);
    } finally {
      setLoading(false);
    }
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
  }, []);

  return (
    <FeedContext.Provider value={{ posts, addPost, fetchPosts, loading, error }}>
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
