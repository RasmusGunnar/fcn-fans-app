import React, { useCallback, useRef, useState } from 'react';
import { logger } from '../lib/logger';
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
import { PickedMedia, pickFromLibrary, pickCameraPhoto, recordVideo } from '../lib/mediaPicker';
import { uploadMediaToSupabase } from '../lib/upload';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { EntityAutocompleteList } from './composer/EntityAutocompleteList';
import { createMentionNotifications } from '../services/mentionNotifications';
import { triggerMentionPush } from '../services/mentionPushApi';
import { persistPostEntities } from '../services/postEntities';
import { useEntityAutocomplete } from '../hooks/useEntityAutocomplete';
import { useFeed } from '../state/FeedContext';
import { Post } from '../types/post';
import type { Actor } from '../types/news';
import { triggerCommunityPostPush } from '../services/postPushApi';

interface PostComposerProps {
  onSuccess?: () => void;
  actor?: Actor;
  feedTargets?: string[];
}

export function PostComposer({ onSuccess, actor, feedTargets }: PostComposerProps) {
  logger.log('[PostComposer] Component mounted');
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();
  const { addPost, fetchPosts } = useFeed();
  const [text, setText] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [attachment, setAttachment] = useState<PickedMedia | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput | null>(null);
  const {
    activeMatch,
    mentionSuggestions,
    hashtagSuggestions,
    visible,
    handleSelectMention,
    handleSelectHashtag,
    clear: clearAutocomplete,
  } = useEntityAutocomplete({
    text,
    selection,
    isFocused: isInputFocused,
    setText,
    setSelection,
  });

  const refocusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleSelectMentionSuggestion = useCallback(
    (item: Parameters<typeof handleSelectMention>[0]) => {
      handleSelectMention(item);
      refocusInput();
    },
    [handleSelectMention, refocusInput],
  );

  const handleSelectHashtagSuggestion = useCallback(
    (tag: string) => {
      handleSelectHashtag(tag);
      refocusInput();
    },
    [handleSelectHashtag, refocusInput],
  );

  const handlePickLibrary = async () => {
    logger.log('[PostComposer] Pick from library clicked');
    try {
      const asset = await pickFromLibrary();
      if (asset) {
        logger.log('[PostComposer] Media selected from library');
        setAttachment(asset);
      } else {
        logger.log('[PostComposer] Library picker cancelled (no asset returned)');
      }
    } catch (e: any) {
      logger.error('[PostComposer] Pick library error:', e);
      alert('Kunne ikke vælge medie: ' + (e?.message || e));
    }
  };

  const handlePickCamera = async () => {
    logger.log('[PostComposer] Take photo clicked');
    try {
      const asset = await pickCameraPhoto();
      if (asset) {
        logger.log('[PostComposer] Photo taken');
        setAttachment(asset);
      } else {
        logger.log('[PostComposer] Camera cancelled (no asset returned)');
      }
    } catch (e: any) {
      logger.error('[PostComposer] Camera error:', e);
      alert('Kunne ikke tage billede: ' + (e?.message || e));
    }
  };

  const handleRecordVideo = async () => {
    logger.log('[PostComposer] Record video clicked');
    try {
      const asset = await recordVideo();
      if (asset) {
        logger.log('[PostComposer] Video recorded');
        setAttachment(asset);
      } else {
        logger.log('[PostComposer] Video recording cancelled (no asset returned)');
      }
    } catch (e: any) {
      logger.error('[PostComposer] Record video error:', e);
      alert('Kunne ikke optage video: ' + (e?.message || e));
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
        logger.log('[PostComposer] Uploading attachment for user', { userId: user.id });
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
        logger.log('[PostComposer] Attachment uploaded', {
          bucket: 'post-media',
          path: uploaded.path,
        });
      } else if (attachment && !user?.id) {
        throw new Error('Vedhæftning valgt men bruger ikke logget ind');
      }
    } catch (e: any) {
      logger.error('[PostComposer] Upload error', e);
      alert('Upload fejlede: ' + (e?.message ?? String(e)));
      setLoading(false);
      return;
    }

    // Insert post and fetch it back from DB to ensure consistency (exactly as existing code)
    let dbPost: Post | null = null;
    try {
      if (user?.id) {
        const resolvedActorType = actor?.type ?? 'user';
        const resolvedActorId = actor?.type === 'community' ? actor.id : user.id;
        const resolvedFeedTargets =
          Array.isArray(feedTargets) && feedTargets.length > 0
            ? feedTargets
            : actor?.type === 'community'
              ? [`community:${actor.id}`]
              : ['home'];

        const { data, error } = await supabase
          .from('posts')
          .insert({
            author_id: user.id,
            actor_type: resolvedActorType,
            actor_id: resolvedActorId,
            text: text.trim(),
            media: mediaArray,
            feed_targets: resolvedFeedTargets,
            media_type: attachment?.type ?? null,
            ...(actor?.type === 'community' ? { community_id: actor.id } : {}),
          })
          .select(
            'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets',
          );
        if (error) throw error;

        if (data && data[0]) {
          const dbRecord = data[0];
          const actorDisplayName =
            actor?.type === 'community' ? actor.name : (user?.email ?? 'Ukendt');
          const actorAvatarUrl = actor?.type === 'community' ? (actor.avatarUrl ?? null) : null;
          // DB-returned post is the source of truth
          dbPost = {
            id: dbRecord.id,
            authorName: user?.email ?? 'Ukendt',
            authorId: dbRecord.author_id,
            actorType: dbRecord.actor_type ?? 'user',
            actorId: dbRecord.actor_id ?? dbRecord.author_id,
            actorDisplayName,
            actorAvatarUrl,
            communityName: actor?.type === 'community' ? actor.name : undefined,
            communityId: dbRecord.community_id ?? null,
            feedTargets: dbRecord.feed_targets ?? ['home'],
            createdAt: dbRecord.created_at || new Date().toISOString(),
            text: dbRecord.text,
            likesCount: 0,
            commentsCount: 0,
            likedByMe: false,
            media: dbRecord.media, // Use DB media (may be parsed as array or string)
          };
          logger.log('[PostComposer] Post inserted and fetched from DB:', {
            postId: dbPost.id,
            media: dbPost.media,
          });

          const { mentionedProfiles } = await persistPostEntities(
            dbRecord.id,
            dbRecord.text ?? text.trim(),
          );

          void (async () => {
            if (mentionedProfiles.length > 0) {
              const [mentionNotificationsResult, mentionPushResult] = await Promise.allSettled([
                createMentionNotifications({
                  mentionedUsernames: mentionedProfiles
                    .map((profile) => profile.username)
                    .filter((username): username is string => Boolean(username)),
                  actorId: user.id,
                  postId: dbRecord.id,
                  entityType: 'post',
                  entityId: dbRecord.id,
                }),
                triggerMentionPush({
                  actorUserId: user.id,
                  mentionedUserIds: mentionedProfiles.map((profile) => profile.id),
                  entityType: 'post',
                  entityId: dbRecord.id,
                  postId: dbRecord.id,
                  previewText: dbRecord.text ?? text.trim(),
                }),
              ]);

              if (mentionNotificationsResult.status === 'rejected') {
                logger.warn('[PostComposer] createMentionNotifications failed:', {
                  postId: dbRecord.id,
                  error: mentionNotificationsResult.reason,
                });
              }

              if (mentionPushResult.status === 'rejected') {
                logger.warn('[PostComposer] triggerMentionPush failed:', {
                  postId: dbRecord.id,
                  error: mentionPushResult.reason,
                });
              } else if (!mentionPushResult.value) {
                logger.warn('[PostComposer] triggerMentionPush returned false', {
                  postId: dbRecord.id,
                });
              }
            }

            if (actor?.type === 'community') {
              try {
                const didTriggerCommunityPush = await triggerCommunityPostPush(dbRecord.id);
                if (!didTriggerCommunityPush) {
                  logger.warn('[PostComposer] triggerCommunityPostPush returned false', {
                    postId: dbRecord.id,
                  });
                }
              } catch (error) {
                logger.warn('[PostComposer] triggerCommunityPostPush failed:', {
                  postId: dbRecord.id,
                  error,
                });
              }
            }
          })();
        }
      }
    } catch (e) {
      logger.warn('[PostComposer] Insert post error', e);
    }

    // Use DB-fetched post if available, otherwise fallback to locally constructed
    const newPost: Post = dbPost || {
      id: Date.now().toString(),
      authorName: user?.email ?? 'Ukendt',
      authorId: user?.id,
      actorType: actor?.type ?? 'user',
      actorId: actor?.type === 'community' ? actor.id : user?.id,
      actorDisplayName: actor?.type === 'community' ? actor.name : (user?.email ?? 'Ukendt'),
      actorAvatarUrl: actor?.type === 'community' ? (actor.avatarUrl ?? null) : null,
      communityName: actor?.type === 'community' ? actor.name : undefined,
      communityId: actor?.type === 'community' ? actor.id : null,
      createdAt: new Date().toISOString(),
      text: text.trim(),
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
      media: mediaArray,
      feedTargets:
        Array.isArray(feedTargets) && feedTargets.length > 0
          ? feedTargets
          : actor?.type === 'community'
            ? [`community:${actor.id}`]
            : ['home'],
    };

    addPost(newPost);

    // Optional: Soft refresh to sync with DB (ensures no duplicates due to dedupe logic)
    try {
      await fetchPosts();
    } catch (e) {
      if (__DEV__) {
        logger.log('[PostComposer] Post-creation refresh skipped:', e);
      }
    }

    setLoading(false);
    setText('');
    setSelection({ start: 0, end: 0 });
    clearAutocomplete();
    setAttachment(null);
    logger.log('[PostComposer] Post published successfully, calling onSuccess');
    onSuccess?.();
  };

  return (
    <View style={styles.container}>
      <Card style={styles.sectionCard}>
        <Text style={styles.label}>Dit opslag</Text>
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          placeholder="Hvad er på dit hjerte?"
          placeholderTextColor={theme.colors.text.secondary}
          multiline
          numberOfLines={6}
          value={text}
          onChangeText={setText}
          selection={selection}
          onSelectionChange={({ nativeEvent }) => setSelection(nativeEvent.selection)}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => {
            setTimeout(() => {
              setIsInputFocused(false);
              clearAutocomplete();
            }, 0);
          }}
          editable={!loading}
        />
        <EntityAutocompleteList
          visible={visible}
          type={activeMatch?.type ?? null}
          mentionSuggestions={mentionSuggestions}
          hashtagSuggestions={hashtagSuggestions}
          onSelectMention={handleSelectMentionSuggestion}
          onSelectHashtag={handleSelectHashtagSuggestion}
        />
        {attachment && (
          <View style={styles.previewContainer}>
            {attachment.type === 'image' ? (
              <Image source={{ uri: attachment.uri }} style={styles.previewImage} />
            ) : (
              <View style={styles.previewVideoPlaceholder}>
                <Ionicons
                  name="play-circle"
                  size={theme.spacing[10]}
                  color={theme.colors.text.secondary}
                />
                <Text style={styles.previewVideoText}>Video vedhæftet</Text>
              </View>
            )}
            <Pressable
              style={styles.removeAttachment}
              onPress={() => setAttachment(null)}
              disabled={loading}
            >
              <Ionicons name="close-circle" size={22} color={theme.colors.primary} />
              <Text style={styles.removeAttachmentText}>Fjern vedhæftning</Text>
            </Pressable>
          </View>
        )}
      </Card>

      {!attachment && (
        <Card style={styles.sectionCard}>
          <Text style={styles.label}>Tilføj medie (valgfrit)</Text>
          <View style={styles.imageButtonsContainer}>
            <Pressable style={styles.imageButton} onPress={handlePickCamera} disabled={loading}>
              <Ionicons name="camera" size={20} color={theme.colors.text.secondary} />
              <Text style={styles.imageButtonText}>Tag billede</Text>
            </Pressable>

            <Pressable style={styles.imageButton} onPress={handleRecordVideo} disabled={loading}>
              <Ionicons name="videocam" size={20} color={theme.colors.text.secondary} />
              <Text style={styles.imageButtonText}>Optag video</Text>
            </Pressable>

            <Pressable style={styles.imageButton} onPress={handlePickLibrary} disabled={loading}>
              <Ionicons name="images" size={20} color={theme.colors.text.secondary} />
              <Text style={styles.imageButtonText}>Vælg fra bibliotek</Text>
            </Pressable>
          </View>
        </Card>
      )}

      <View
        style={[
          styles.submitButtonWrap,
          !text.trim() || loading ? styles.submitButtonWrapDisabled : null,
        ]}
      >
        <View style={styles.submitButtonInner}>
          <PrimaryButton
            title={loading ? 'Deler...' : 'Del opslag'}
            onPress={handlePublish}
            disabled={!text.trim() || loading}
          />
        </View>
      </View>

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
      paddingHorizontal: theme.spacing[2],
      paddingTop: theme.spacing[3],
      paddingBottom: theme.spacing[5],
    },
    sectionCard: {
      marginBottom: theme.spacing[3],
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    label: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    textInput: {
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      borderRadius: theme.radius.md,
      padding: theme.spacing[4],
      minHeight: 148,
      fontSize: 15,
      color: theme.colors.text.primary,
      textAlignVertical: 'top',
      backgroundColor: theme.colors.bg.subtle,
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
      alignItems: 'stretch',
    },
    imageButton: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 84,
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[2],
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.elevated,
      borderRadius: theme.radius.md,
      gap: theme.spacing[2],
    },
    imageButtonText: {
      fontSize: 13,
      color: theme.colors.text.primary,
      fontWeight: '600',
      textAlign: 'center',
      flexShrink: 1,
      lineHeight: 17,
    },
    submitButtonWrap: {
      marginTop: theme.spacing[3],
      padding: theme.spacing[2],
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.card,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    submitButtonWrapDisabled: {
      backgroundColor: theme.colors.bg.elevated,
      borderColor: theme.colors.border.default,
      opacity: 1,
    },
    submitButtonInner: {
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      padding: theme.spacing[1],
    },
    loadingOverlay: {
      marginTop: theme.spacing[2],
      alignItems: 'center',
    },
    previewVideoPlaceholder: {
      width: '100%',
      height: 200,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.bg.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing[2],
    },
    previewVideoText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.secondary,
    },
  });
}
