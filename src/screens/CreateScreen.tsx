import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useFeed } from '../state/FeedContext';
import { normalizePostType, type Post } from '../types/post';
import { Card } from '../components/ui/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radius } from '../theme';
import { MediaAsset, pickFromLibrary } from '../lib/mediaPicker';
import { uploadMediaToSupabase } from '../lib/upload';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { addPost, fetchPosts } = useFeed();
  const { user } = useAuth();
  const route = useRoute() as any;
  const [text, setText] = useState('');
  const [audienceType, setAudienceType] = useState<'all' | 'community' | 'faction'>('all');
  const [selectedCommunity, setSelectedCommunity] = useState('Farum Fans');
  const [selectedFaction, setSelectedFaction] = useState('Farum Fighters');
  const [attachment, setAttachment] = useState<MediaAsset | null>(
    route?.params?.initialAttachment ?? null,
  );

  const handlePublish = async () => {
    if (!text.trim()) {
      alert('Skriv noget før du udgiver!');
      return;
    }
    let mediaArray: Post['media'] = [];
    try {
      if (attachment && user?.id) {
        console.log('[CreateScreen] Uploading attachment for user', { userId: user.id });
        const uploaded = await uploadMediaToSupabase(user.id, attachment);

        // Sanity check: path must exist after upload
        if (!uploaded.path) {
          throw new Error(`Upload returned invalid result - path: ${uploaded.path}`);
        }

        // Save bucket + path structure (NOT URLs)
        mediaArray = [
          {
            bucket: 'post-media',
            path: uploaded.path,
            type: uploaded.type,
            width: uploaded.width,
            height: uploaded.height,
            ...(uploaded.thumbnail_path && uploaded.thumbnail_bucket
              ? { thumbnail_path: uploaded.thumbnail_path, thumbnail_bucket: uploaded.thumbnail_bucket }
              : {}),
          },
        ];
        console.log('[CreateScreen] Attachment uploaded', {
          bucket: 'post-media',
          path: uploaded.path,
          thumbnail_path: uploaded.thumbnail_path,
        });
      } else if (attachment && !user?.id) {
        throw new Error('Vedhæftning valgt men bruger ikke logget ind');
      }
    } catch (e: any) {
      console.error('[CreateScreen] Upload error', e);
      alert('Upload fejlede: ' + (e?.message ?? String(e)));
      return;
    }

    // Insert post and fetch it back from DB to ensure consistency
    let dbPost: Post | null = null;
    try {
      if (user?.id) {
        const { data, error } = await supabase
          .from('posts')
          .insert({
            author_id: user.id,
            text: text.trim(),
            media: mediaArray,
            ...(audienceType === 'community' && route?.params?.communityId
              ? { community_id: route.params.communityId }
              : {}),
          })
          .select('id, created_at, author_id, text, media, community_id, post_type');
        if (error) throw error;

        if (data && data[0]) {
          const dbRecord = data[0];
          // DB-returned post is the source of truth
          dbPost = {
            id: dbRecord.id,
            postType: normalizePostType(dbRecord.post_type),
            authorName: user?.email ?? 'Ukendt',
            authorId: dbRecord.author_id,
            communityId: dbRecord.community_id ?? null,
            createdAt: dbRecord.created_at || new Date().toISOString(),
            text: dbRecord.text,
            communityName: audienceType === 'community' ? selectedCommunity : undefined,
            factionName: audienceType === 'faction' ? selectedFaction : undefined,
            likesCount: 0,
            commentsCount: 0,
            likedByMe: false,
            media: dbRecord.media, // Use DB media (may be parsed as array or string)
          };
          console.log('[CreateScreen] Post inserted and fetched from DB:', {
            postId: dbPost.id,
            media: dbPost.media,
          });
        }
      }
    } catch (e) {
      console.warn('[CreateScreen] Insert post error', e);
    }

    // Use DB-fetched post if available, otherwise fallback to locally constructed
    const newPost: Post = dbPost || {
      id: Date.now().toString(),
      postType: 'post',
      authorName: user?.email ?? 'Ukendt',
      authorId: user?.id,
      communityId:
        audienceType === 'community' && route?.params?.communityId
          ? route.params.communityId
          : null,
      createdAt: new Date().toISOString(),
      text: text.trim(),
      communityName: audienceType === 'community' ? selectedCommunity : undefined,
      factionName: audienceType === 'faction' ? selectedFaction : undefined,
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
      media: mediaArray,
    };

    addPost(newPost);

    // Optional: Soft refresh to sync with DB (ensures no duplicates due to dedupe logic)
    // This is safe because addPost has dedupe logic based on post.id
    try {
      await fetchPosts();
    } catch (e) {
      // Ignore refresh errors - optimistic update already happened
      if (__DEV__) {
        console.log('[CreateScreen] Post-creation refresh skipped:', e);
      }
    }

    setText('');
    setAudienceType('all');
    setAttachment(null);
  };

  const getAudienceDisplay = () => {
    switch (audienceType) {
      case 'community':
        return selectedCommunity;
      case 'faction':
        return selectedFaction;
      default:
        return 'Alle fans';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Nyt opslag</Text>
      </View>

      <ScrollView style={styles.content}>
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={styles.label}>Publikum</Text>
          <View style={styles.audienceButtonsContainer}>
            <Pressable
              style={[styles.audienceButton, audienceType === 'all' && styles.audienceButtonActive]}
              onPress={() => setAudienceType('all')}
            >
              <Text
                style={[
                  styles.audienceButtonText,
                  audienceType === 'all' && styles.audienceButtonTextActive,
                ]}
              >
                Alle fans
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.audienceButton,
                audienceType === 'community' && styles.audienceButtonActive,
              ]}
              onPress={() => setAudienceType('community')}
            >
              <Text
                style={[
                  styles.audienceButtonText,
                  audienceType === 'community' && styles.audienceButtonTextActive,
                ]}
              >
                Fællesskab: {selectedCommunity}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.audienceButton,
                audienceType === 'faction' && styles.audienceButtonActive,
              ]}
              onPress={() => setAudienceType('faction')}
            >
              <Text
                style={[
                  styles.audienceButtonText,
                  audienceType === 'faction' && styles.audienceButtonTextActive,
                ]}
              >
                Fanfraktion: {selectedFaction}
              </Text>
            </Pressable>
          </View>
        </Card>

        <Card style={{ marginBottom: spacing.md }}>
          <Text style={styles.label}>Dit opslag</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Hvad er på dit hjerte?"
            placeholderTextColor={colors.subtext}
            multiline
            numberOfLines={6}
            value={text}
            onChangeText={setText}
          />
          {attachment && (
            <View style={styles.previewContainer}>
              {attachment.type === 'image' ? (
                <Image source={{ uri: attachment.uri }} style={styles.previewImage} />
              ) : (
                <View style={styles.previewVideoPlaceholder}>
                  <Ionicons name="videocam" size={24} color={colors.subtext} />
                  <Text style={styles.previewVideoText}>Video vedhæftet</Text>
                </View>
              )}
              <Pressable style={styles.removeAttachment} onPress={() => setAttachment(null)}>
                <Ionicons name="close-circle" size={22} color={colors.fcnRed} />
                <Text style={styles.removeAttachmentText}>Fjern vedhæftning</Text>
              </Pressable>
            </View>
          )}
        </Card>

        <Card style={{ marginBottom: spacing.md }}>
          <Pressable
            style={styles.attachButton}
            onPress={async () => {
              const a = await pickFromLibrary();
              if (a) setAttachment(a);
            }}
          >
            <Ionicons name="images" size={20} color={colors.fcnRed} />
            <Text style={styles.attachButtonText}>Vælg fra bibliotek</Text>
          </Pressable>
        </Card>

        <PrimaryButton title="Udgiv opslag" onPress={handlePublish} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  audienceButtonsContainer: {
    gap: spacing.sm,
  },
  audienceButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  audienceButtonActive: {
    backgroundColor: colors.fcnRed,
  },
  audienceButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  audienceButtonTextActive: {
    color: colors.card,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 120,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  previewContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  previewVideoPlaceholder: {
    height: 120,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  previewVideoText: {
    color: colors.subtext,
    fontSize: 14,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  attachButtonText: {
    marginLeft: spacing.sm,
    fontSize: 14,
    color: colors.fcnRed,
  },
  removeAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  removeAttachmentText: {
    color: colors.fcnRed,
    fontSize: 14,
  },
});
