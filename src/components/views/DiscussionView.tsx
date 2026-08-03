import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { ArticlePreview } from '../cards/ArticlePreview';
import { Avatar } from '../Avatar';
import { Button, Card } from '../ui';
import type { PickedMedia } from '../../lib/mediaPicker';
import { pickFromLibrary, pickImageFromLibrary } from '../../lib/mediaPicker';
import {
  createDiscussionPost,
  fetchActiveDiscussionModeration,
  fetchDiscussionPosts,
  fetchDiscussionThreads,
  fetchOpenDiscussionReports,
  hideDiscussionPost,
  markDiscussionThreadRead,
  reportDiscussionPost,
  setDiscussionThreadLocked,
  setDiscussionThreadPinned,
  showDiscussionPost,
  softDeleteDiscussionPost,
  timeoutDiscussionUser,
  toggleDiscussionReaction,
  updateDiscussionPost,
} from '../../services/discussionsApi';
import { defaultTheme } from '../../theme';
import type {
  DiscussionPost,
  DiscussionPostMedia,
  DiscussionReport,
  DiscussionReportReason,
  DiscussionThread,
  DiscussionUserModeration,
} from '../../types/discussion';
import type { ResolvedMediaItem } from '../../utils/media';
import {
  canEditDiscussionPost,
  DISCUSSION_MAX_IMAGES,
  groupDiscussionReplies,
  splitDiscussionTextByUrls,
  validateDiscussionMediaSelection,
} from '../../utils/discussion';

const theme = defaultTheme;
const RULES_STORAGE_KEY_PREFIX = 'discussion-rules-accepted-v1';

type ReportDraft = {
  post: DiscussionPost;
  reason: DiscussionReportReason;
  details: string;
};

type DiscussionInputFocusOptions = {
  focus?: boolean;
  scrollToEnd?: boolean;
};

type DiscussionInputFocusHandler = (
  inputRef: React.RefObject<TextInput | null>,
  options?: DiscussionInputFocusOptions,
) => void | (() => void);

function formatRelativeTime(timestamp?: string | null): string {
  if (!timestamp) return 'Ingen aktivitet endnu';
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} min. siden`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} t. siden`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d. siden`;
}

function flattenPosts(posts: DiscussionPost[]): DiscussionPost[] {
  return posts.flatMap((post) => [post, ...post.replies]);
}

function replacePostInTree(
  posts: DiscussionPost[],
  postId: string,
  updater: (post: DiscussionPost) => DiscussionPost,
): DiscussionPost[] {
  return posts.map((post) => {
    if (post.id === postId) return updater(post);
    return {
      ...post,
      replies: post.replies.map((reply) => (reply.id === postId ? updater(reply) : reply)),
    };
  });
}

function ThreadCard({
  thread,
  onPress,
}: {
  thread: DiscussionThread;
  onPress: (thread: DiscussionThread) => void;
}) {
  return (
    <Pressable onPress={() => onPress(thread)} accessibilityRole="button">
      <Card style={styles.threadCard}>
        <View style={styles.threadHeaderRow}>
          <View style={styles.threadIconWrap}>
            <Ionicons name="chatbubbles-outline" size={22} color={theme.colors.brand.accent} />
          </View>
          <View style={styles.threadHeaderText}>
            <View style={styles.threadTitleRow}>
              {thread.isPinned ? (
                <Ionicons name="pin" size={14} color={theme.colors.brand.gold} />
              ) : null}
              <Text style={styles.threadTitle}>{thread.title}</Text>
            </View>
            {thread.description ? (
              <Text style={styles.threadDescription}>{thread.description}</Text>
            ) : null}
          </View>
          {thread.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
              </Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
        </View>
        <View style={styles.threadMetaRow}>
          <Text style={styles.metaText}>{thread.replyCount} indlæg</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{formatRelativeTime(thread.lastPostAt)}</Text>
          {thread.isLocked ? (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.lockedText}>Lukket</Text>
            </>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function DiscussionRules({ accepted, onAccept }: { accepted: boolean; onAccept: () => void }) {
  if (accepted) return null;

  return (
    <Card style={styles.rulesCard}>
      <Text style={styles.rulesTitle}>Debatregler</Text>
      <Text style={styles.rulesText}>
        Hold tonen ordentlig, del ikke private oplysninger, og anmeld indlæg, der ikke hører til i
        fællesskabet.
      </Text>
      <Button title="Jeg forstår" onPress={onAccept} size="sm" />
    </Card>
  );
}

function MediaGrid({
  media,
  onOpen,
}: {
  media: DiscussionPostMedia[];
  onOpen: (index: number) => void;
}) {
  if (media.length === 0) return null;

  return (
    <View style={styles.mediaGrid}>
      {media.map((item, index) => {
        const sourceUri = item.type === 'video' ? item.thumbnailUrl || item.url : item.url;
        const showVideoPlaceholder = item.type === 'video' && !item.thumbnailUrl;

        return (
          <Pressable
            key={item.id}
            style={[styles.mediaTile, media.length === 1 && styles.mediaTileLarge]}
            onPress={() => onOpen(index)}
            accessibilityRole="imagebutton"
          >
            {showVideoPlaceholder ? (
              <View style={styles.videoPlaceholder}>
                <Ionicons name="videocam" size={28} color={theme.colors.text.secondary} />
              </View>
            ) : (
              <Image source={{ uri: sourceUri }} style={styles.mediaImage} resizeMode="cover" />
            )}
            {item.type === 'video' ? (
              <View style={styles.videoPlayOverlay}>
                <Ionicons name="play" size={24} color={theme.colors.text.inverse} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function LinkedPostBody({ body }: { body: string }) {
  const segments = useMemo(() => splitDiscussionTextByUrls(body), [body]);

  return (
    <Text style={styles.postBody}>
      {segments.map((segment, index) => {
        if (segment.type === 'url') {
          return (
            <Text
              key={`${segment.url}-${index}`}
              style={styles.postBodyLink}
              onPress={() => {
                void Linking.openURL(segment.url).catch(() => undefined);
              }}
            >
              {segment.text}
            </Text>
          );
        }

        return <Text key={`text-${index}`}>{segment.text}</Text>;
      })}
    </Text>
  );
}

function getReplyPreview(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

function Composer({
  thread,
  userId,
  replyTo,
  focusRequestKey,
  rulesAccepted,
  moderation,
  onInputFocus,
  onClearReply,
  onPostCreated,
}: {
  thread: DiscussionThread;
  userId: string;
  replyTo: DiscussionPost | null;
  focusRequestKey: number;
  rulesAccepted: boolean;
  moderation: DiscussionUserModeration | null;
  onInputFocus?: DiscussionInputFocusHandler;
  onClearReply: () => void;
  onPostCreated: () => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replyToId = replyTo?.id ?? null;
  const replyPreview = replyTo ? getReplyPreview(replyTo.body) : '';

  const disabledReason = useMemo(() => {
    if (thread.isLocked) return 'Tråden er lukket for nye indlæg.';
    if (moderation) {
      return moderation.status === 'blocked'
        ? 'Du er blokeret fra Debat.'
        : 'Du har midlertidig timeout fra Debat.';
    }
    if (!rulesAccepted) return 'Accepter debatreglerne før første indlæg.';
    return null;
  }, [moderation, rulesAccepted, thread.isLocked]);

  useEffect(() => {
    if (!replyToId || focusRequestKey === 0) return;

    if (onInputFocus) {
      return onInputFocus(inputRef, { focus: true, scrollToEnd: true });
    }

    const focusTimer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(focusTimer);
  }, [focusRequestKey, onInputFocus, replyToId]);

  const addImage = async () => {
    const picked = await pickImageFromLibrary();
    if (!picked) return;
    const next = [...media, picked];
    const validation = validateDiscussionMediaSelection(next);
    if (validation) {
      Alert.alert('Medie kan ikke tilføjes', validation);
      return;
    }
    setMedia(next);
  };

  const addMedia = async () => {
    const picked = await pickFromLibrary();
    if (!picked) return;
    const next = [...media, picked];
    const validation = validateDiscussionMediaSelection(next);
    if (validation) {
      Alert.alert('Medie kan ikke tilføjes', validation);
      return;
    }
    setMedia(next);
  };

  const submit = async () => {
    if (disabledReason || submitting) return;

    const validation = validateDiscussionMediaSelection(media);
    if (validation) {
      setError(validation);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createDiscussionPost({
        threadId: thread.id,
        parentPostId: replyTo?.id ?? null,
        body,
        userId,
        media,
      });
      setBody('');
      setMedia([]);
      onClearReply();
      onPostCreated();
    } catch (submitError: any) {
      setError(submitError?.message || 'Indlægget kunne ikke oprettes.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={styles.composerCard}>
      {replyTo ? (
        <View style={styles.replyBanner}>
          <View style={styles.replyBannerCopy}>
            <Text style={styles.replyBannerText}>Svarer til {replyTo.author.displayName}</Text>
            <Text style={styles.replyPreviewText} numberOfLines={2}>
              {replyPreview}
            </Text>
          </View>
          <Pressable
            style={styles.cancelReplyButton}
            onPress={onClearReply}
            accessibilityRole="button"
          >
            <Text style={styles.cancelReplyText}>× Annuller svar</Text>
          </Pressable>
        </View>
      ) : null}

      {disabledReason ? <Text style={styles.disabledText}>{disabledReason}</Text> : null}

      <TextInput
        value={body}
        onChangeText={setBody}
        placeholderTextColor={theme.colors.text.muted}
        editable={!disabledReason && !submitting}
        multiline
        ref={inputRef}
        onFocus={() => onInputFocus?.(inputRef)}
        placeholder={replyTo ? 'Skriv dit svar...' : 'Skriv i debatten...'}
        style={styles.composerInput}
      />

      {media.length > 0 ? (
        <View style={styles.selectedMediaRow}>
          {media.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={styles.selectedMediaTile}>
              {item.type === 'image' ? (
                <Image source={{ uri: item.uri }} style={styles.selectedMediaImage} />
              ) : (
                <View style={styles.selectedVideoTile}>
                  <Ionicons name="videocam" size={20} color={theme.colors.text.secondary} />
                </View>
              )}
              <Pressable
                style={styles.removeMediaButton}
                onPress={() => setMedia((current) => current.filter((_, i) => i !== index))}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={14} color={theme.colors.text.inverse} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.composerActions}>
        <View style={styles.attachActions}>
          <Pressable
            style={styles.iconAction}
            onPress={addImage}
            disabled={Boolean(disabledReason) || media.length >= DISCUSSION_MAX_IMAGES}
            accessibilityRole="button"
          >
            <Ionicons name="image-outline" size={20} color={theme.colors.brand.accent} />
          </Pressable>
          <Pressable
            style={styles.iconAction}
            onPress={addMedia}
            disabled={Boolean(disabledReason) || media.length > 0}
            accessibilityRole="button"
          >
            <Ionicons name="videocam-outline" size={20} color={theme.colors.brand.accent} />
          </Pressable>
        </View>
        <Button
          title={submitting ? 'Sender...' : 'Send'}
          onPress={submit}
          disabled={Boolean(disabledReason) || submitting || body.trim().length === 0}
          size="sm"
        />
      </View>
    </Card>
  );
}

function PostItem({
  post,
  userId,
  isAdmin,
  onReply,
  onOpenMedia,
  onReport,
  onRefresh,
  onInputFocus,
  onOptimisticLike,
}: {
  post: DiscussionPost;
  userId: string;
  isAdmin: boolean;
  onReply: (post: DiscussionPost) => void;
  onOpenMedia: (post: DiscussionPost, index: number) => void;
  onReport: (post: DiscussionPost) => void;
  onRefresh: () => void;
  onInputFocus?: DiscussionInputFocusHandler;
  onOptimisticLike: (postId: string, nextLiked: boolean) => void;
}) {
  const editInputRef = useRef<TextInput>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [saving, setSaving] = useState(false);

  const canEdit = canEditDiscussionPost(post, userId);

  const handleLike = async () => {
    const nextLiked = !post.likedByMe;
    onOptimisticLike(post.id, nextLiked);
    try {
      await toggleDiscussionReaction({ postId: post.id, userId, liked: post.likedByMe });
    } catch {
      onOptimisticLike(post.id, post.likedByMe);
      Alert.alert('Fejl', 'Reaktionen kunne ikke gemmes.');
    }
  };

  const handleDelete = () => {
    Alert.alert('Slet indlæg?', 'Indlægget skjules for andre, men bevares til moderation.', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Slet',
        style: 'destructive',
        onPress: async () => {
          try {
            await softDeleteDiscussionPost(post.id, userId);
            onRefresh();
          } catch {
            Alert.alert('Fejl', 'Indlægget kunne ikke slettes.');
          }
        },
      },
    ]);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await updateDiscussionPost({ postId: post.id, body: editBody });
      setEditing(false);
      onRefresh();
    } catch (error: any) {
      Alert.alert('Fejl', error?.message || 'Indlægget kunne ikke opdateres.');
    } finally {
      setSaving(false);
    }
  };

  const hidePost = async () => {
    try {
      await hideDiscussionPost({ postId: post.id, adminUserId: userId, reason: 'Skjult af admin' });
      onRefresh();
    } catch {
      Alert.alert('Fejl', 'Indlægget kunne ikke skjules.');
    }
  };

  const showPost = async () => {
    try {
      await showDiscussionPost(post.id);
      onRefresh();
    } catch {
      Alert.alert('Fejl', 'Indlægget kunne ikke vises igen.');
    }
  };

  const timeoutUser = async () => {
    try {
      await timeoutDiscussionUser({
        userId: post.authorId,
        adminUserId: userId,
        reason: 'Timeout fra debat',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      Alert.alert('Timeout givet', 'Brugeren kan ikke skrive i Debat de næste 24 timer.');
    } catch {
      Alert.alert('Fejl', 'Timeout kunne ikke gemmes.');
    }
  };

  const blockUser = async () => {
    Alert.alert('Bloker bruger fra Debat?', 'Brugeren kan ikke skrive nye debatindlæg.', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Bloker',
        style: 'destructive',
        onPress: async () => {
          try {
            await timeoutDiscussionUser({
              userId: post.authorId,
              adminUserId: userId,
              reason: 'Blokeret fra debat',
              expiresAt: null,
            });
            Alert.alert('Bruger blokeret', 'Blokeringen er gemt.');
          } catch {
            Alert.alert('Fejl', 'Blokeringen kunne ikke gemmes.');
          }
        },
      },
    ]);
  };

  const adminDeletePost = async () => {
    Alert.alert('Slet indlæg?', 'Indlægget soft-deletes og kan stadig ses af admins.', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Slet',
        style: 'destructive',
        onPress: async () => {
          try {
            await softDeleteDiscussionPost(post.id, userId);
            onRefresh();
          } catch {
            Alert.alert('Fejl', 'Indlægget kunne ikke slettes.');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.postWrap, post.parentPostId && styles.replyWrap]}>
      <View style={styles.postHeader}>
        <Avatar
          userId={post.authorId}
          avatarUrl={post.author.avatarUrl}
          label={post.author.displayName}
          size={34}
        />
        <View style={styles.postAuthorBlock}>
          <Text style={styles.postAuthor}>{post.author.displayName}</Text>
          <Text style={styles.postMeta}>
            {formatRelativeTime(post.createdAt)}
            {post.editedAt ? ' · Redigeret' : ''}
          </Text>
        </View>
        {post.deletedAt ? <Text style={styles.hiddenBadge}>Slettet</Text> : null}
        {!post.deletedAt && post.hiddenAt ? <Text style={styles.hiddenBadge}>Skjult</Text> : null}
      </View>

      {editing ? (
        <View style={styles.editBox}>
          <TextInput
            value={editBody}
            onChangeText={setEditBody}
            multiline
            ref={editInputRef}
            onFocus={() => onInputFocus?.(editInputRef)}
            style={styles.editInput}
          />
          <View style={styles.inlineActions}>
            <Button title="Gem" onPress={saveEdit} disabled={saving} size="sm" />
            <Button title="Annuller" onPress={() => setEditing(false)} variant="ghost" size="sm" />
          </View>
        </View>
      ) : (
        <LinkedPostBody body={post.body} />
      )}

      {post.linkPreview ? (
        <View style={styles.linkPreviewWrap}>
          <ArticlePreview preview={post.linkPreview} fallbackLabel="Link" />
        </View>
      ) : null}

      <MediaGrid media={post.media} onOpen={(index) => onOpenMedia(post, index)} />

      <View style={styles.postActions}>
        <Pressable style={styles.postAction} onPress={handleLike} accessibilityRole="button">
          <Ionicons
            name={post.likedByMe ? 'heart' : 'heart-outline'}
            size={18}
            color={post.likedByMe ? theme.colors.brand.accent : theme.colors.text.secondary}
          />
          <Text style={styles.postActionText}>{post.reactionCount}</Text>
        </Pressable>
        {!post.parentPostId ? (
          <Pressable
            style={({ pressed }) => [
              styles.postAction,
              styles.replyAction,
              pressed && styles.replyActionPressed,
            ]}
            onPress={() => onReply(post)}
            accessibilityRole="button"
            hitSlop={theme.spacing[1]}
          >
            <Ionicons name="chatbubble-outline" size={18} color={theme.colors.text.secondary} />
            <Text style={styles.postActionText}>Svar</Text>
          </Pressable>
        ) : null}
        {canEdit ? (
          <>
            <Pressable
              style={styles.postAction}
              onPress={() => setEditing(true)}
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={18} color={theme.colors.text.secondary} />
              <Text style={styles.postActionText}>Rediger</Text>
            </Pressable>
            <Pressable style={styles.postAction} onPress={handleDelete} accessibilityRole="button">
              <Ionicons name="trash-outline" size={18} color={theme.colors.text.secondary} />
              <Text style={styles.postActionText}>Slet</Text>
            </Pressable>
          </>
        ) : null}
        {post.authorId !== userId ? (
          <Pressable
            style={styles.postAction}
            onPress={() => onReport(post)}
            accessibilityRole="button"
          >
            <Ionicons name="flag-outline" size={18} color={theme.colors.text.secondary} />
            <Text style={styles.postActionText}>Anmeld</Text>
          </Pressable>
        ) : null}
      </View>

      {isAdmin ? (
        <View style={styles.adminActions}>
          <Pressable style={styles.adminPill} onPress={post.hiddenAt ? showPost : hidePost}>
            <Text style={styles.adminPillText}>{post.hiddenAt ? 'Vis indlæg' : 'Skjul'}</Text>
          </Pressable>
          {!post.deletedAt ? (
            <Pressable style={styles.adminPill} onPress={adminDeletePost}>
              <Text style={styles.adminPillText}>Slet</Text>
            </Pressable>
          ) : null}
          {post.authorId !== userId ? (
            <>
              <Pressable style={styles.adminPill} onPress={timeoutUser}>
                <Text style={styles.adminPillText}>Timeout 24t</Text>
              </Pressable>
              <Pressable style={styles.adminPill} onPress={blockUser}>
                <Text style={styles.adminPillText}>Bloker</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      {post.replies.map((reply) => (
        <PostItem
          key={reply.id}
          post={reply}
          userId={userId}
          isAdmin={isAdmin}
          onReply={onReply}
          onOpenMedia={onOpenMedia}
          onReport={onReport}
          onRefresh={onRefresh}
          onInputFocus={onInputFocus}
          onOptimisticLike={onOptimisticLike}
        />
      ))}
    </View>
  );
}

function ReportModal({
  draft,
  userId,
  onClose,
  onSubmitted,
}: {
  draft: ReportDraft | null;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [reason, setReason] = useState<DiscussionReportReason>('other');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (draft) {
      setReason(draft.reason);
      setDetails(draft.details);
    }
  }, [draft]);

  const submit = async () => {
    if (!draft) return;
    setSubmitting(true);
    try {
      await reportDiscussionPost({
        postId: draft.post.id,
        userId,
        reason,
        details,
      });
      onSubmitted();
      onClose();
    } catch (error: any) {
      Alert.alert('Fejl', error?.message || 'Anmeldelsen kunne ikke sendes.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={Boolean(draft)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Anmeld indlæg</Text>
          <View style={styles.reasonGrid}>
            {[
              ['spam', 'Spam'],
              ['abuse', 'Groft sprog'],
              ['harassment', 'Chikane'],
              ['personal_info', 'Private oplysninger'],
              ['other', 'Andet'],
            ].map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.reasonPill, reason === value && styles.reasonPillActive]}
                onPress={() => setReason(value as DiscussionReportReason)}
              >
                <Text style={[styles.reasonText, reason === value && styles.reasonTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Tilføj evt. kort forklaring"
            placeholderTextColor={theme.colors.text.muted}
            multiline
            style={styles.reportInput}
          />
          <View style={styles.inlineActions}>
            <Button title="Send" onPress={submit} disabled={submitting} size="sm" />
            <Button title="Annuller" onPress={onClose} variant="ghost" size="sm" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DiscussionView({ onInputFocus }: { onInputFocus?: DiscussionInputFocusHandler }) {
  const navigation = useNavigation<any>();
  const { user, isAppAdmin } = useAuth();
  const [threads, setThreads] = useState<DiscussionThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<DiscussionThread | null>(null);
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [replyTo, setReplyTo] = useState<DiscussionPost | null>(null);
  const [composerFocusRequestKey, setComposerFocusRequestKey] = useState(0);
  const [moderation, setModeration] = useState<DiscussionUserModeration | null>(null);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const [adminReports, setAdminReports] = useState<DiscussionReport[]>([]);

  const userId = user?.id ?? '';
  const replyToId = replyTo?.id ?? null;
  const replyToBody = replyTo?.body ?? null;
  const replyToAuthorName = replyTo?.author.displayName ?? null;
  const replyToAuthorAvatarUrl = replyTo?.author.avatarUrl ?? null;

  const rulesKey = useMemo(
    () => (userId ? `${RULES_STORAGE_KEY_PREFIX}:${userId}` : null),
    [userId],
  );

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedThreads = await fetchDiscussionThreads();
      setThreads(loadedThreads);
    } catch (loadError: any) {
      setError(loadError?.message || 'Debatten kunne ikke hentes.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPosts = useCallback(
    async (thread = selectedThread, options?: { appendOlder?: boolean }) => {
      if (!thread || !userId) return;
      setPostsLoading(true);
      setError(null);
      try {
        const flattened = flattenPosts(posts);
        const oldest = flattened[0]?.createdAt ?? null;
        const loadedPosts = await fetchDiscussionPosts({
          threadId: thread.id,
          userId,
          before: options?.appendOlder ? oldest : null,
        });
        setPosts((current) =>
          options?.appendOlder
            ? groupDiscussionReplies([...flattenPosts(loadedPosts), ...flattenPosts(current)])
            : loadedPosts,
        );

        if (!options?.appendOlder) {
          const latestVisiblePost = flattenPosts(loadedPosts)
            .filter((post) => !post.hiddenAt && !post.deletedAt)
            .sort((left, right) => {
              const timestampDiff =
                new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
              return timestampDiff !== 0 ? timestampDiff : right.id.localeCompare(left.id);
            })[0];

          if (latestVisiblePost) {
            try {
              await markDiscussionThreadRead({
                threadId: thread.id,
                lastSeenPostId: latestVisiblePost.id,
              });
              setThreads((current) =>
                current.map((item) => (item.id === thread.id ? { ...item, unreadCount: 0 } : item)),
              );
              setSelectedThread((current) =>
                current?.id === thread.id ? { ...current, unreadCount: 0 } : current,
              );
            } catch (readStateError) {
              console.warn('[DiscussionView] Could not update thread read state:', readStateError);
            }
          }
        }
      } catch (loadError: any) {
        setError(loadError?.message || 'Indlæg kunne ikke hentes.');
      } finally {
        setPostsLoading(false);
      }
    },
    [posts, selectedThread, userId],
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedThread) {
        void loadThreads();
      }
    }, [loadThreads, selectedThread]),
  );

  useEffect(() => {
    if (!rulesKey) return;
    void AsyncStorage.getItem(rulesKey).then((value) => setRulesAccepted(value === 'true'));
  }, [rulesKey]);

  useEffect(() => {
    if (!userId) return;
    void fetchActiveDiscussionModeration(userId).then(setModeration);
  }, [userId]);

  useEffect(() => {
    if (isAppAdmin) {
      void fetchOpenDiscussionReports()
        .then(setAdminReports)
        .catch(() => setAdminReports([]));
    }
  }, [isAppAdmin]);

  useEffect(() => {
    if (!replyToId) return;

    const currentParent = flattenPosts(posts).find((post) => post.id === replyToId);
    if (!currentParent || currentParent.hiddenAt || currentParent.deletedAt) {
      setReplyTo(null);
      return;
    }

    if (
      currentParent.body !== replyToBody ||
      currentParent.author.displayName !== replyToAuthorName ||
      currentParent.author.avatarUrl !== replyToAuthorAvatarUrl
    ) {
      setReplyTo(currentParent);
    }
  }, [posts, replyToAuthorAvatarUrl, replyToAuthorName, replyToBody, replyToId]);

  const openThread = async (thread: DiscussionThread) => {
    setSelectedThread(thread);
    setPosts([]);
    setReplyTo(null);
    await loadPosts(thread);
  };

  const acceptRules = async () => {
    if (rulesKey) {
      await AsyncStorage.setItem(rulesKey, 'true');
    }
    setRulesAccepted(true);
  };

  const openMedia = (post: DiscussionPost, index: number) => {
    const items: ResolvedMediaItem[] = post.media.map((item) => ({
      uri: item.url,
      type: item.type,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? undefined,
    }));

    const rootNavigation = navigation.getParent?.()?.getParent?.() ?? navigation;
    rootNavigation.navigate('MediaViewer', {
      items,
      initialIndex: index,
      postId: post.id,
    });
  };

  const startReply = useCallback((post: DiscussionPost) => {
    setReplyTo(post);
    setComposerFocusRequestKey((current) => current + 1);
  }, []);

  const optimisticLike = (postId: string, nextLiked: boolean) => {
    setPosts((current) =>
      replacePostInTree(current, postId, (post) => {
        const previousCount = post.reactionCount;
        const nextCount = nextLiked
          ? previousCount + (post.likedByMe ? 0 : 1)
          : Math.max(0, previousCount - (post.likedByMe ? 1 : 0));
        return {
          ...post,
          likedByMe: nextLiked,
          reactionCount: nextCount,
        };
      }),
    );
  };

  const toggleLocked = async () => {
    if (!selectedThread) return;
    try {
      await setDiscussionThreadLocked({
        threadId: selectedThread.id,
        locked: !selectedThread.isLocked,
      });
      setSelectedThread({ ...selectedThread, isLocked: !selectedThread.isLocked });
      void loadThreads();
    } catch {
      Alert.alert('Fejl', 'Tråden kunne ikke opdateres.');
    }
  };

  const togglePinned = async () => {
    if (!selectedThread) return;
    try {
      await setDiscussionThreadPinned({
        threadId: selectedThread.id,
        pinned: !selectedThread.isPinned,
      });
      setSelectedThread({ ...selectedThread, isPinned: !selectedThread.isPinned });
      void loadThreads();
    } catch {
      Alert.alert('Fejl', 'Tråden kunne ikke opdateres.');
    }
  };

  if (loading) {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={theme.colors.brand.accent} />
        <Text style={styles.stateText}>Henter Debat...</Text>
      </Card>
    );
  }

  if (error && threads.length === 0) {
    return (
      <Card style={styles.stateCard}>
        <Ionicons name="warning-outline" size={28} color={theme.colors.warning} />
        <Text style={styles.stateTitle}>Debat kunne ikke hentes</Text>
        <Text style={styles.stateText}>{error}</Text>
        <Button title="Prøv igen" onPress={loadThreads} size="sm" />
      </Card>
    );
  }

  if (!selectedThread) {
    return (
      <View style={styles.wrap}>
        <Card style={styles.introCard}>
          <Text style={styles.introTitle}>Debat</Text>
          <Text style={styles.introText}>
            Skriv med andre FCN-fans om kampe, transfers, tribunen og alt omkring klubben.
          </Text>
        </Card>

        {threads.length === 0 ? (
          <Card style={styles.stateCard}>
            <Text style={styles.stateTitle}>Ingen tråde endnu</Text>
            <Text style={styles.stateText}>Den faste hovedtråd oprettes af migrationen.</Text>
          </Card>
        ) : (
          threads.map((thread) => (
            <ThreadCard key={thread.id} thread={thread} onPress={openThread} />
          ))
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.backButton}
        onPress={() => {
          setReplyTo(null);
          setSelectedThread(null);
        }}
      >
        <Ionicons name="chevron-back" size={20} color={theme.colors.brand.accent} />
        <Text style={styles.backText}>Tilbage til tråde</Text>
      </Pressable>

      <Card style={styles.threadDetailHeader}>
        <View style={styles.threadTitleRow}>
          {selectedThread.isPinned ? (
            <Ionicons name="pin" size={14} color={theme.colors.brand.gold} />
          ) : null}
          <Text style={styles.threadDetailTitle}>{selectedThread.title}</Text>
        </View>
        {selectedThread.description ? (
          <Text style={styles.threadDescription}>{selectedThread.description}</Text>
        ) : null}
        {selectedThread.isLocked ? <Text style={styles.lockedText}>Tråden er lukket</Text> : null}
        {isAppAdmin ? (
          <View style={styles.adminActions}>
            <Pressable style={styles.adminPill} onPress={togglePinned}>
              <Text style={styles.adminPillText}>
                {selectedThread.isPinned ? 'Fjern pin' : 'Fastgør'}
              </Text>
            </Pressable>
            <Pressable style={styles.adminPill} onPress={toggleLocked}>
              <Text style={styles.adminPillText}>
                {selectedThread.isLocked ? 'Genåbn' : 'Luk tråd'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>

      {isAppAdmin && adminReports.length > 0 ? (
        <Card style={styles.adminReportCard}>
          <Text style={styles.adminReportTitle}>Åbne anmeldelser</Text>
          {adminReports.slice(0, 3).map((report) => (
            <Text key={report.id} style={styles.adminReportText}>
              {report.reason} · {formatRelativeTime(report.createdAt)}
            </Text>
          ))}
        </Card>
      ) : null}

      <DiscussionRules accepted={rulesAccepted} onAccept={acceptRules} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {postsLoading && posts.length === 0 ? (
        <Card style={styles.stateCard}>
          <ActivityIndicator color={theme.colors.brand.accent} />
          <Text style={styles.stateText}>Henter indlæg...</Text>
        </Card>
      ) : null}

      {posts.length === 0 && !postsLoading ? (
        <Card style={styles.stateCard}>
          <Text style={styles.stateTitle}>Start debatten</Text>
          <Text style={styles.stateText}>Der er ingen indlæg i tråden endnu.</Text>
        </Card>
      ) : null}

      {posts.length > 0 ? (
        <Pressable
          style={styles.loadOlderButton}
          onPress={() => loadPosts(selectedThread, { appendOlder: true })}
        >
          <Text style={styles.loadOlderText}>Indlæs ældre indlæg</Text>
        </Pressable>
      ) : null}

      {posts.map((post) => (
        <PostItem
          key={post.id}
          post={post}
          userId={userId}
          isAdmin={isAppAdmin}
          onReply={startReply}
          onOpenMedia={openMedia}
          onReport={(reportedPost) =>
            setReportDraft({ post: reportedPost, reason: 'other', details: '' })
          }
          onRefresh={() => loadPosts(selectedThread)}
          onInputFocus={onInputFocus}
          onOptimisticLike={optimisticLike}
        />
      ))}

      {userId ? (
        <Composer
          thread={selectedThread}
          userId={userId}
          replyTo={replyTo}
          focusRequestKey={composerFocusRequestKey}
          rulesAccepted={rulesAccepted}
          moderation={moderation}
          onInputFocus={onInputFocus}
          onClearReply={() => setReplyTo(null)}
          onPostCreated={() => {
            void loadPosts(selectedThread);
            void loadThreads();
          }}
        />
      ) : null}

      <ReportModal
        draft={reportDraft}
        userId={userId}
        onClose={() => setReportDraft(null)}
        onSubmitted={() => Alert.alert('Tak', 'Anmeldelsen er sendt til moderation.')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[4],
  },
  introCard: {
    borderRadius: theme.components.card.borderRadius,
  },
  introTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.h3,
  },
  introText: {
    marginTop: theme.spacing[1],
    color: theme.colors.text.secondary,
    ...theme.typography.body,
  },
  threadCard: {
    borderRadius: theme.components.card.borderRadius,
  },
  threadHeaderRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    alignItems: 'center',
  },
  threadIconWrap: {
    width: theme.spacing[11],
    height: theme.spacing[11],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  unreadBadge: {
    minWidth: theme.spacing[7],
    height: theme.spacing[7],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: theme.colors.text.inverse,
    ...theme.typography.small,
    fontWeight: '700',
  },
  threadTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  threadTitle: {
    flex: 1,
    color: theme.colors.text.primary,
    ...theme.typography.bodyBold,
  },
  threadDescription: {
    marginTop: theme.spacing[1],
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  threadMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing[1],
    marginTop: theme.spacing[3],
  },
  metaText: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  metaDot: {
    color: theme.colors.text.muted,
    ...theme.typography.small,
  },
  lockedText: {
    color: theme.colors.warning,
    ...theme.typography.small,
    fontWeight: '600',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  backText: {
    color: theme.colors.brand.accent,
    ...theme.typography.bodyBold,
  },
  threadDetailHeader: {
    borderRadius: theme.components.card.borderRadius,
  },
  threadDetailTitle: {
    flex: 1,
    color: theme.colors.text.primary,
    ...theme.typography.h3,
  },
  rulesCard: {
    borderRadius: theme.components.card.borderRadius,
    backgroundColor: theme.colors.bg.elevated,
  },
  rulesTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyBold,
  },
  rulesText: {
    marginVertical: theme.spacing[2],
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  stateCard: {
    alignItems: 'center',
    gap: theme.spacing[2],
    borderRadius: theme.components.card.borderRadius,
  },
  stateTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyBold,
    textAlign: 'center',
  },
  stateText: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
    textAlign: 'center',
  },
  postWrap: {
    padding: theme.spacing[4],
    borderRadius: theme.components.card.borderRadius,
    backgroundColor: theme.colors.bg.surface,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    gap: theme.spacing[2],
  },
  replyWrap: {
    marginTop: theme.spacing[3],
    marginLeft: theme.spacing[6],
    backgroundColor: theme.colors.bg.subtle,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  postAuthorBlock: {
    flex: 1,
    minWidth: 0,
  },
  postAuthor: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyBold,
  },
  postMeta: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  hiddenBadge: {
    color: theme.colors.warning,
    ...theme.typography.small,
    fontWeight: '700',
  },
  postBody: {
    color: theme.colors.text.primary,
    ...theme.typography.body,
  },
  postBodyLink: {
    color: theme.colors.brand.accent,
    textDecorationLine: 'underline',
  },
  postActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
  },
  replyAction: {
    minHeight: theme.spacing[9],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.pill,
  },
  replyActionPressed: {
    backgroundColor: theme.colors.bg.subtle,
  },
  postActionText: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
    fontWeight: '600',
  },
  linkPreviewWrap: {
    marginTop: theme.spacing[1],
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  mediaTile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg.subtle,
  },
  mediaTileLarge: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg.subtle,
  },
  videoPlayOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    width: theme.spacing[12],
    height: theme.spacing[12],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.overlay.heavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerCard: {
    borderRadius: theme.components.card.borderRadius,
    gap: theme.spacing[3],
  },
  composerInput: {
    minHeight: theme.spacing[16] + theme.spacing[4],
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.bg.surface,
    textAlignVertical: 'top',
    ...theme.typography.body,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[2],
  },
  attachActions: {
    flexDirection: 'row',
    gap: theme.spacing[2],
  },
  iconAction: {
    width: theme.spacing[10],
    height: theme.spacing[10],
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg.subtle,
  },
  replyBanner: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg.subtle,
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.subtle,
  },
  replyBannerCopy: {
    gap: theme.spacing[1],
  },
  replyBannerText: {
    color: theme.colors.text.primary,
    ...theme.typography.small,
    fontWeight: '700',
  },
  replyPreviewText: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  cancelReplyButton: {
    alignSelf: 'flex-start',
    minHeight: theme.spacing[8],
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.radius.sm,
  },
  cancelReplyText: {
    color: theme.colors.brand.accent,
    ...theme.typography.small,
    fontWeight: '700',
  },
  selectedMediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  selectedMediaTile: {
    position: 'relative',
    width: theme.spacing[16],
    height: theme.spacing[16],
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg.subtle,
  },
  selectedMediaImage: {
    width: '100%',
    height: '100%',
  },
  selectedVideoTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMediaButton: {
    position: 'absolute',
    top: theme.spacing[1],
    right: theme.spacing[1],
    width: theme.spacing[5],
    height: theme.spacing[5],
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.overlay.heavy,
  },
  disabledText: {
    color: theme.colors.warning,
    ...theme.typography.small,
  },
  errorText: {
    color: theme.colors.error,
    ...theme.typography.small,
  },
  editBox: {
    gap: theme.spacing[2],
  },
  editInput: {
    minHeight: theme.spacing[16],
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.bg.card,
    textAlignVertical: 'top',
    ...theme.typography.body,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flexWrap: 'wrap',
  },
  adminActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  adminPill: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.pill.neutral.bg,
  },
  adminPillText: {
    color: theme.colors.pill.neutral.text,
    ...theme.typography.small,
    fontWeight: '700',
  },
  adminReportCard: {
    borderRadius: theme.components.card.borderRadius,
  },
  adminReportTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyBold,
  },
  adminReportText: {
    marginTop: theme.spacing[1],
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay.heavy,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[5],
  },
  modalCard: {
    width: '100%',
    borderRadius: theme.radius.lg,
    padding: theme.spacing[5],
    backgroundColor: theme.colors.bg.elevated,
    gap: theme.spacing[3],
  },
  modalTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.h3,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  reasonPill: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg.subtle,
  },
  reasonPillActive: {
    backgroundColor: theme.colors.brand.accent,
  },
  reasonText: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
    fontWeight: '600',
  },
  reasonTextActive: {
    color: theme.colors.text.inverse,
  },
  reportInput: {
    minHeight: theme.spacing[16] + theme.spacing[4],
    borderWidth: theme.layout.borderHairline,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
    color: theme.colors.text.primary,
    textAlignVertical: 'top',
    ...theme.typography.body,
  },
  loadOlderButton: {
    alignSelf: 'center',
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bg.subtle,
  },
  loadOlderText: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
    fontWeight: '700',
  },
});
