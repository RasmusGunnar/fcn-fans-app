import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { fetchLinkPreview } from '../services/newsApi';
import { useFeed } from '../state/FeedContext';
import { Post } from '../types/post';
import type { Actor } from '../types/news';
import {
  buildPostLinkPreview,
  canUseLinkPreviewColumn,
  extractFirstUrl,
  isMissingLinkPreviewColumnError,
  markLinkPreviewColumnAvailable,
  markLinkPreviewColumnMissing,
  resolvePostLinkPreview,
} from '../utils/linkPreview';
import { LinkPreviewCard } from './LinkPreviewCard';

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
  const [attachment, setAttachment] = useState<PickedMedia | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkPreview, setLinkPreview] = useState<Post['linkPreview']>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const detectedUrl = useMemo(() => extractFirstUrl(text), [text]);
  const activePreviewUrl = useMemo(() => {
    if (!detectedUrl || detectedUrl === dismissedUrl) {
      return null;
    }

    return detectedUrl;
  }, [detectedUrl, dismissedUrl]);
  const resolvedLinkPreview = useMemo(
    () =>
      activePreviewUrl
        ? linkPreview?.url === activePreviewUrl
          ? linkPreview
          : buildPostLinkPreview(activePreviewUrl)
        : null,
    [activePreviewUrl, linkPreview],
  );

  useEffect(() => {
    if (!detectedUrl) {
      setDismissedUrl(null);
      return;
    }

    if (dismissedUrl && dismissedUrl !== detectedUrl) {
      setDismissedUrl(null);
    }
  }, [detectedUrl, dismissedUrl]);

  useEffect(() => {
    const requestId = ++previewRequestIdRef.current;
    let cancelled = false;

    if (!activePreviewUrl) {
      setLinkPreview(null);
      setPreviewError(null);
      setLoadingPreview(false);
      return;
    }

    const fallbackPreview = buildPostLinkPreview(activePreviewUrl);
    setLinkPreview(fallbackPreview);
    setPreviewError(null);
    setLoadingPreview(true);

    const timer = setTimeout(async () => {
      try {
        const preview = await fetchLinkPreview(activePreviewUrl);
        if (cancelled || previewRequestIdRef.current !== requestId) {
          return;
        }

        setLinkPreview(buildPostLinkPreview(preview.url || activePreviewUrl, preview));
      } catch (error: any) {
        if (cancelled || previewRequestIdRef.current !== requestId) {
          return;
        }

        logger.warn('[PostComposer] Link preview fetch failed', {
          url: activePreviewUrl,
          message: error?.message || error,
        });
        setLinkPreview(fallbackPreview);
        setPreviewError('Kunne ikke hente metadata');
      } finally {
        if (!cancelled && previewRequestIdRef.current === requestId) {
          setLoadingPreview(false);
        }
      }
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activePreviewUrl]);

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

    if (!user?.id) {
      alert('Du skal være logget ind for at dele opslag.');
      return;
    }

    setLoading(true);
    let mediaArray: Post['media'] = [];
    const linkPreviewPayload = resolvedLinkPreview
      ? { ...resolvedLinkPreview }
      : detectedUrl && dismissedUrl === detectedUrl
        ? {
            ...buildPostLinkPreview(detectedUrl),
            dismissed: true,
          }
        : null;

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
    let insertErrorMessage: string | null = null;
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

        const baseInsertPayload = {
          author_id: user.id,
          actor_type: resolvedActorType,
          actor_id: resolvedActorId,
          text: text.trim(),
          media: mediaArray,
          feed_targets: resolvedFeedTargets,
          media_type: attachment?.type ?? null,
          ...(actor?.type === 'community' ? { community_id: actor.id } : {}),
        };
        let data: any[] | null = null;
        let error: any = null;

        const insertAttempts = canUseLinkPreviewColumn()
          ? ([
              {
                payload: {
                  ...baseInsertPayload,
                  link_preview: linkPreviewPayload,
                },
                select:
                  'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets, link_preview',
              },
              {
                payload: baseInsertPayload,
                select:
                  'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets',
              },
            ] as const)
          : ([
              {
                payload: baseInsertPayload,
                select:
                  'id, created_at, author_id, actor_type, actor_id, text, media, community_id, feed_targets',
              },
            ] as const);

        for (const attempt of insertAttempts) {
          const result = await supabase.from('posts').insert(attempt.payload).select(attempt.select);

          if (!result.error) {
            if ('link_preview' in attempt.payload || attempt.select.includes('link_preview')) {
              markLinkPreviewColumnAvailable();
            }
            data = result.data;
            error = null;
            break;
          }

          error = result.error;
          if (!isMissingLinkPreviewColumnError(result.error)) {
            break;
          }

          markLinkPreviewColumnMissing();

          logger.warn('[PostComposer] posts.insert missing link_preview column, retrying without it', {
            error: result.error,
          });
        }

        if (error) throw error;

        if (data && data[0]) {
          const dbRecord = data[0];
          const actorDisplayName =
            actor?.type === 'community' ? actor.name : user?.email ?? 'Ukendt';
          const actorAvatarUrl = actor?.type === 'community' ? actor.avatarUrl ?? null : null;
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
            linkPreview:
              resolvePostLinkPreview(
                'link_preview' in dbRecord ? dbRecord.link_preview : linkPreviewPayload,
                dbRecord.text,
              ) ?? linkPreviewPayload,
            likesCount: 0,
            commentsCount: 0,
            likedByMe: false,
            media: dbRecord.media, // Use DB media (may be parsed as array or string)
          };
          logger.log('[PostComposer] Post inserted and fetched from DB:', {
            postId: dbPost.id,
            media: dbPost.media,
          });
        }
      }
    } catch (e) {
      logger.warn('[PostComposer] Insert post error', e);
      insertErrorMessage = e instanceof Error ? e.message : String(e);
    }

    if (user?.id && !dbPost) {
      alert(`Post fejlede: ${insertErrorMessage ?? 'Kunne ikke gemme opslaget'}`);
      setLoading(false);
      return;
    }

    // Use DB-fetched post if available, otherwise fallback to locally constructed
    const newPost: Post = dbPost || {
      id: Date.now().toString(),
      authorName: user?.email ?? 'Ukendt',
      authorId: user?.id,
      actorType: actor?.type ?? 'user',
      actorId: actor?.type === 'community' ? actor.id : user?.id,
      actorDisplayName: actor?.type === 'community' ? actor.name : user?.email ?? 'Ukendt',
      actorAvatarUrl: actor?.type === 'community' ? actor.avatarUrl ?? null : null,
      communityName: actor?.type === 'community' ? actor.name : undefined,
      communityId: actor?.type === 'community' ? actor.id : null,
      createdAt: new Date().toISOString(),
      text: text.trim(),
      linkPreview: linkPreviewPayload,
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
    setText('');
    setAttachment(null);
    setLinkPreview(null);
    setLoadingPreview(false);
    setPreviewError(null);
    setDismissedUrl(null);
    setLoading(false);
    logger.log('[PostComposer] Post published successfully, calling onSuccess');
    onSuccess?.();

    // Soft refresh in the background so a slow feed reload never blocks composer state reset.
    void fetchPosts().catch((e) => {
      if (__DEV__) {
        logger.log('[PostComposer] Post-creation refresh skipped:', e);
      }
    });
  };

  return (
    <View style={styles.container}>
      <Card style={styles.sectionCard}>
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
        {resolvedLinkPreview ? (
          <LinkPreviewCard
            preview={resolvedLinkPreview}
            mode="composer"
            loading={loadingPreview}
            error={previewError}
            onRemove={() => {
              if (activePreviewUrl) {
                setDismissedUrl(activePreviewUrl);
              }
            }}
            style={styles.linkPreviewCard}
          />
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

      <View style={[styles.submitButtonWrap, !text.trim() || loading ? styles.submitButtonWrapDisabled : null]}>
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
    linkPreviewCard: {
      marginTop: theme.spacing[3],
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
