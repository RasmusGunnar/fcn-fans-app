import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './ui/Card';
import { PrimaryButton } from './PrimaryButton';
import { useTheme, Theme } from '../theme';
import { MediaAsset, pickFromLibrary, pickCameraPhoto } from '../lib/mediaPicker';
import { uploadMediaToSupabase } from '../lib/upload';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { useFeed } from '../state/FeedContext';
import { Post } from '../types/post';
import type { Actor } from '../types/news';

interface PostComposerProps {
  onSuccess?: () => void;
  actor?: Actor;
}

export function PostComposer({ onSuccess, actor }: PostComposerProps) {
  console.log('[PostComposer] Component mounted');
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();
  const { addPost, fetchPosts } = useFeed();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<MediaAsset | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePickLibrary = async () => {
    console.log('[PostComposer] Pick from library clicked');
    try {
      const asset = await pickFromLibrary();
      if (asset) {
        console.log('[PostComposer] Image selected from library');
        setAttachment(asset);
      } else {
        console.log('[PostComposer] Image picker cancelled (no asset returned)');
      }
    } catch (e: any) {
      console.error('[PostComposer] Pick library error:', e);
      alert('Kunne ikke vælge billede: ' + (e?.message || e));
    }
  };

  const handlePickCamera = async () => {
    console.log('[PostComposer] Take photo clicked');
    try {
      const asset = await pickCameraPhoto();
      if (asset) {
        console.log('[PostComposer] Photo taken');
        setAttachment(asset);
      } else {
        console.log('[PostComposer] Camera cancelled (no asset returned)');
      }
    } catch (e: any) {
      console.error('[PostComposer] Camera error:', e);
      alert('Kunne ikke tage billede: ' + (e?.message || e));
    }
  };

  const handlePublish = async () => {
    if (!text.trim()) {
      alert('Skriv noget før du udgiver!');
      return;
    }

    setLoading(true);
    let mediaArray: Post['media'] = [];

    try {
      // Upload attachment if present (reuse existing upload flow)
      if (attachment && user?.id) {
        console.log('[PostComposer] Uploading attachment for user', { userId: user.id });
        const uploaded = await uploadMediaToSupabase(user.id, attachment);

        // Sanity check: path must exist after upload
        if (!uploaded.path) {
          throw new Error(`Upload returned invalid result - path: ${uploaded.path}`);
        }

        // Save bucket + path structure (NOT URLs) - exactly as existing code does
        mediaArray = [
          {
            bucket: 'post-media',
            path: uploaded.path,
            type: uploaded.type,
            width: uploaded.width,
            height: uploaded.height,
          },
        ];
        console.log('[PostComposer] Attachment uploaded', {
          bucket: 'post-media',
          path: uploaded.path,
        });
      } else if (attachment && !user?.id) {
        throw new Error('Vedhæftning valgt men bruger ikke logget ind');
      }
    } catch (e: any) {
      console.error('[PostComposer] Upload error', e);
      alert('Upload fejlede: ' + (e?.message ?? String(e)));
      setLoading(false);
      return;
    }

    // Insert post and fetch it back from DB to ensure consistency (exactly as existing code)
    let dbPost: Post | null = null;
    try {
      if (user?.id) {
        const { data, error } = await supabase
          .from('posts')
          .insert({
            author_id: user.id,
            text: text.trim(),
            media: mediaArray,
            ...(actor?.type === 'community' ? { community_id: actor.id } : {}),
          })
          .select('id, created_at, author_id, text, media, community_id');
        if (error) throw error;

        if (data && data[0]) {
          const dbRecord = data[0];
          // DB-returned post is the source of truth
          dbPost = {
            id: dbRecord.id,
            authorName: user?.email ?? 'Ukendt',
            authorId: dbRecord.author_id,
            communityId: dbRecord.community_id ?? null,
            createdAt: dbRecord.created_at || new Date().toISOString(),
            text: dbRecord.text,
            likesCount: 0,
            commentsCount: 0,
            likedByMe: false,
            media: dbRecord.media, // Use DB media (may be parsed as array or string)
          };
          console.log('[PostComposer] Post inserted and fetched from DB:', {
            postId: dbPost.id,
            media: dbPost.media,
          });
        }
      }
    } catch (e) {
      console.warn('[PostComposer] Insert post error', e);
    }

    // Use DB-fetched post if available, otherwise fallback to locally constructed
    const newPost: Post = dbPost || {
      id: Date.now().toString(),
      authorName: user?.email ?? 'Ukendt',
      authorId: user?.id,
      createdAt: new Date().toISOString(),
      text: text.trim(),
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
      media: mediaArray,
    };

    addPost(newPost);

    // Optional: Soft refresh to sync with DB (ensures no duplicates due to dedupe logic)
    try {
      await fetchPosts();
    } catch (e) {
      if (__DEV__) {
        console.log('[PostComposer] Post-creation refresh skipped:', e);
      }
    }

    setLoading(false);
    setText('');
    setAttachment(null);
    console.log('[PostComposer] Post published successfully, calling onSuccess');
    onSuccess?.();
  };

  return (
    <View style={styles.container}>
      <Card style={{ marginBottom: theme.spacing[4] }}>
        <Text style={styles.label}>Dit opslag</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Hvad er på dit hjerte?"
          placeholderTextColor={theme.colors.text.secondary}
          multiline
          numberOfLines={6}
          value={text}
          onChangeText={setText}
          editable={!loading}
        />
        {attachment && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: attachment.uri }} style={styles.previewImage} />
            <Pressable
              style={styles.removeAttachment}
              onPress={() => setAttachment(null)}
              disabled={loading}
            >
              <Ionicons name="close-circle" size={22} color={theme.colors.primary} />
              <Text style={styles.removeAttachmentText}>Fjern billede</Text>
            </Pressable>
          </View>
        )}
      </Card>

      {!attachment && (
        <Card style={{ marginBottom: theme.spacing[4] }}>
          <Text style={styles.label}>Tilføj billede (valgfrit)</Text>
          <View style={styles.imageButtonsContainer}>
            <Pressable style={styles.imageButton} onPress={handlePickCamera} disabled={loading}>
              <Ionicons name="camera" size={20} color={theme.colors.primary} />
              <Text style={styles.imageButtonText}>Tag billede</Text>
            </Pressable>

            <Pressable style={styles.imageButton} onPress={handlePickLibrary} disabled={loading}>
              <Ionicons name="images" size={20} color={theme.colors.primary} />
              <Text style={styles.imageButtonText}>Vælg fra bibliotek</Text>
            </Pressable>
          </View>
        </Card>
      )}

      <PrimaryButton
        title={loading ? 'Deler...' : 'Del opslag'}
        onPress={handlePublish}
        disabled={!text.trim() || loading}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      padding: theme.layout.screenPadding,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    textInput: {
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.sm,
      padding: theme.spacing[4],
      minHeight: 120,
      fontSize: 14,
      color: theme.colors.text.primary,
      textAlignVertical: 'top',
    },
    previewContainer: {
      marginTop: theme.spacing[4],
      gap: theme.spacing[2],
    },
    previewImage: {
      width: '100%',
      height: 200,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.border.default,
    },
    removeAttachment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    removeAttachmentText: {
      color: theme.colors.primary,
      fontSize: 14,
    },
    imageButtonsContainer: {
      flexDirection: 'row',
      gap: theme.spacing[2],
    },
    imageButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing[4],
      paddingHorizontal: theme.spacing[2],
      borderWidth: 1,
      borderColor: theme.colors.primary,
      borderRadius: theme.radius.sm,
      gap: theme.spacing[1],
    },
    imageButtonText: {
      fontSize: 14,
      color: theme.colors.primary,
      fontWeight: '500',
    },
    loadingOverlay: {
      marginTop: theme.spacing[2],
      alignItems: 'center',
    },
  });
}
