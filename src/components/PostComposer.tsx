import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useEntityAutocomplete } from '../hooks/useEntityAutocomplete';
import { logger } from '../lib/logger';
import {
  extractInstagramShare,
  removeStandaloneInstagramUrl,
  toInstagramLinkPreview,
} from '../lib/instagram';
import {
  pickCameraPhoto,
  pickFromLibrary,
  recordVideo,
  type PickedMedia,
} from '../lib/mediaPicker';
import { supabase } from '../lib/supabase';
import { uploadMediaToSupabase } from '../lib/upload';
import { createMentionNotifications } from '../services/mentionNotifications';
import { triggerMentionPush } from '../services/mentionPushApi';
import { fetchLinkPreview } from '../services/newsApi';
import { persistPostEntities } from '../services/postEntities';
import { triggerCommunityPostPush } from '../services/postPushApi';
import { useFeed } from '../state/FeedContext';
import { type Theme, useTheme } from '../theme';
import type { Actor } from '../types/news';
import type { SharedLinkAttachment } from '../types/externalShare';
import { normalizePostType, type Post } from '../types/post';
import { extractFirstUrl, normalizeLinkPreview } from '../utils/linkPreview';
import { buildPostInsertPayload, shouldSyncPostToHome } from '../utils/postComposerPayload';
import { EntityAutocompleteList } from './composer/EntityAutocompleteList';
import { PrimaryButton } from './PrimaryButton';
import { Card } from './ui/Card';
import { InstagramEmbedPreview } from './shared/InstagramEmbedPreview';

interface PostComposerProps {
  onSuccess?: () => void;
  actor?: Actor;
  feedTargets?: string[];
  initialExternalShare?: SharedLinkAttachment;
}

export function PostComposer({
  onSuccess,
  actor,
  feedTargets,
  initialExternalShare,
}: PostComposerProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();
  const { addPost, fetchPosts } = useFeed();
  const [text, setText] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [attachment, setAttachment] = useState<PickedMedia | null>(null);
  const [externalShare, setExternalShare] = useState<SharedLinkAttachment | null>(
    initialExternalShare ?? null,
  );
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (initialExternalShare) setExternalShare(initialExternalShare);
  }, [initialExternalShare]);

  const handleTextChange = useCallback((value: string) => {
    const parsed = extractInstagramShare(value);
    if (parsed) setExternalShare(parsed);
    setText(removeStandaloneInstagramUrl(value, parsed));
  }, []);
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
    includeCommunityMentions: true,
  });

  const refocusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
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
    try {
      const asset = await pickFromLibrary();
      if (asset) {
        setAttachment(asset);
      }
    } catch (error: any) {
      logger.error('[PostComposer] Pick library error:', error);
      alert('Kunne ikke vælge medie: ' + (error?.message || error));
    }
  };

  const handlePickCamera = async () => {
    try {
      const asset = await pickCameraPhoto();
      if (asset) {
        setAttachment(asset);
      }
    } catch (error: any) {
      logger.error('[PostComposer] Camera error:', error);
      alert('Kunne ikke tage billede: ' + (error?.message || error));
    }
  };

  const handleRecordVideo = async () => {
    try {
      const asset = await recordVideo();
      if (asset) {
        setAttachment(asset);
      }
    } catch (error: any) {
      logger.error('[PostComposer] Record video error:', error);
      alert('Kunne ikke optage video: ' + (error?.message || error));
    }
  };

  const runPostPublishSideEffects = async (postId: string, publishedText: string) => {
    let mentionedProfiles: Awaited<ReturnType<typeof persistPostEntities>>['mentionedProfiles'] =
      [];

    try {
      ({ mentionedProfiles } = await persistPostEntities(postId, publishedText));
    } catch (error) {
      logger.warn('[PostComposer] persistPostEntities failed:', { postId, error });
    }

    void (async () => {
      if (mentionedProfiles.length > 0 && user?.id) {
        const [notificationResult, pushResult] = await Promise.allSettled([
          createMentionNotifications({
            mentionedUsernames: mentionedProfiles
              .map((profile) => profile.username)
              .filter((username): username is string => Boolean(username)),
            actorId: user.id,
            postId,
            entityType: 'post',
            entityId: postId,
          }),
          triggerMentionPush({
            actorUserId: user.id,
            mentionedUserIds: mentionedProfiles.map((profile) => profile.id),
            entityType: 'post',
            entityId: postId,
            postId,
            previewText: publishedText,
          }),
        ]);

        if (notificationResult.status === 'rejected') {
          logger.warn('[PostComposer] createMentionNotifications failed:', {
            postId,
            error: notificationResult.reason,
          });
        }
        if (pushResult.status === 'rejected' || !pushResult.value) {
          logger.warn('[PostComposer] triggerMentionPush failed:', {
            postId,
            error: pushResult.status === 'rejected' ? pushResult.reason : 'non-ok response',
          });
        }
      }

      if (actor?.type === 'community') {
        const didTriggerCommunityPush = await triggerCommunityPostPush(postId);
        if (!didTriggerCommunityPush) {
          logger.warn('[PostComposer] triggerCommunityPostPush returned false', { postId });
        }
      }
    })();
  };

  const handlePublish = async () => {
    const normalizedText = text.trim();
    if (!normalizedText && !externalShare) {
      alert('Skriv noget eller tilføj et Instagram-link før du udgiver!');
      return;
    }
    if (!user?.id) {
      alert('Du skal være logget ind for at oprette et opslag.');
      return;
    }

    setLoading(true);
    let media: Post['media'] = [];

    try {
      if (attachment) {
        const uploaded = await uploadMediaToSupabase(user.id, attachment);
        media = [
          {
            bucket: uploaded.bucket,
            path: uploaded.path,
            type: uploaded.type,
            mimeType: uploaded.mimeType,
            width: uploaded.width,
            height: uploaded.height,
            duration: uploaded.duration,
            ...(uploaded.thumbnail_path && uploaded.thumbnail_bucket
              ? {
                  thumbnail_path: uploaded.thumbnail_path,
                  thumbnail_bucket: uploaded.thumbnail_bucket,
                }
              : {}),
          },
        ];
        logger.log('[PostComposer] Upload result', {
          type: uploaded.type,
          bucket: uploaded.bucket,
          path: uploaded.path,
          thumbnailPath: uploaded.thumbnail_path ?? null,
        });
      }
    } catch (error: any) {
      logger.error('[PostComposer] Upload error', error);
      alert('Upload fejlede: ' + (error?.message ?? String(error)));
      setLoading(false);
      return;
    }

    let linkPreview = externalShare ? toInstagramLinkPreview(externalShare) : null;
    const firstUrl = externalShare ? null : extractFirstUrl(normalizedText);
    if (firstUrl) {
      try {
        linkPreview = await fetchLinkPreview(firstUrl);
      } catch (error) {
        logger.warn('[PostComposer] Link preview fetch failed; publishing without preview', {
          url: firstUrl,
          error,
        });
      }
    }

    const insertPayload = buildPostInsertPayload(user.id, normalizedText, actor, feedTargets, {
      media,
      linkPreview,
    });
    logger.log('[PostComposer] Insert payload', {
      actor_type: insertPayload.actor_type,
      actor_id: insertPayload.actor_id,
      community_id: 'community_id' in insertPayload ? insertPayload.community_id : null,
      feed_targets: insertPayload.feed_targets,
      mediaLength: insertPayload.media.length,
      media_type: 'media_type' in insertPayload ? insertPayload.media_type : null,
    });

    let dbPost: Post;
    try {
      const { data, error } = await supabase
        .from('posts')
        .insert(insertPayload)
        .select(
          'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets, link_preview, post_type',
        )
        .single();
      if (error) {
        throw error;
      }
      if (!data) {
        throw new Error('Databasen returnerede ikke det oprettede opslag.');
      }

      dbPost = {
        id: data.id,
        postType: normalizePostType(data.post_type),
        authorName: user.email ?? 'Ukendt',
        authorId: data.author_id,
        actorType: data.actor_type ?? insertPayload.actor_type,
        actorId: data.actor_id ?? insertPayload.actor_id,
        actorDisplayName: actor?.type === 'community' ? actor.name : (user.email ?? 'Ukendt'),
        actorAvatarUrl: actor?.type === 'community' ? (actor.avatarUrl ?? null) : null,
        communityName: actor?.type === 'community' ? actor.name : undefined,
        communityId: data.community_id ?? null,
        feedTargets: Array.isArray(data.feed_targets)
          ? data.feed_targets
          : insertPayload.feed_targets,
        createdAt: data.created_at || new Date().toISOString(),
        text: data.text,
        linkPreview: normalizeLinkPreview(data.link_preview),
        likesCount: 0,
        commentsCount: 0,
        likedByMe: false,
        media: data.media,
      };

      logger.log('[PostComposer] Inserted row', {
        id: dbPost.id,
        actor_type: dbPost.actorType,
        actor_id: dbPost.actorId,
        community_id: dbPost.communityId,
        feed_targets: dbPost.feedTargets,
        mediaLength: Array.isArray(dbPost.media) ? dbPost.media.length : 0,
      });
    } catch (error: any) {
      logger.warn('[PostComposer] Insert post error', error);
      alert('Opslaget kunne ikke gemmes: ' + (error?.message ?? 'Prøv igen'));
      setLoading(false);
      return;
    }

    await runPostPublishSideEffects(dbPost.id, dbPost.text);

    if (shouldSyncPostToHome(insertPayload.feed_targets)) {
      addPost(dbPost);
      try {
        await fetchPosts();
      } catch (error) {
        logger.warn('[PostComposer] Post-creation Home refresh failed:', error);
      }
    }

    setLoading(false);
    setText('');
    setSelection({ start: 0, end: 0 });
    clearAutocomplete();
    setAttachment(null);
    setExternalShare(null);
    onSuccess?.();
  };

  const canPublish = Boolean(text.trim() || externalShare);

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
          onChangeText={handleTextChange}
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
        {externalShare ? (
          <View style={styles.externalSharePreview}>
            <InstagramEmbedPreview
              attachment={externalShare}
              onRemove={() => setExternalShare(null)}
            />
          </View>
        ) : null}
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
          !canPublish || loading ? styles.submitButtonWrapDisabled : null,
        ]}
      >
        <View style={styles.submitButtonInner}>
          <PrimaryButton
            title={loading ? 'Deler...' : 'Del opslag'}
            onPress={handlePublish}
            disabled={!canPublish || loading}
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
    externalSharePreview: {
      marginTop: theme.spacing[4],
    },
    previewImage: {
      width: '100%',
      height: 200,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.border.default,
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
  });
}
