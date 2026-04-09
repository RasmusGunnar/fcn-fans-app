import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthProvider';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { triggerMentionPush } from '../services/mentionPushApi';
import { createMentionNotifications } from '../services/mentionNotifications';
import { persistPostEntities } from '../services/postEntities';
import { useEntityAutocomplete } from '../hooks/useEntityAutocomplete';
import { PrimaryButton } from './PrimaryButton';
import { EntityAutocompleteList } from './composer/EntityAutocompleteList';
import { Card } from './ui/Card';
import { Theme, useTheme } from '../theme';
import type { Actor } from '../types/news';
import { triggerCommunityPostPush } from '../services/postPushApi';

interface PollComposerProps {
  actor?: Actor;
  feedTargets?: string[];
  onSuccess?: () => void;
}

const DURATION_OPTIONS = [1, 2, 3, 7] as const;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export function PollComposer({ actor, feedTargets, onSuccess }: PollComposerProps) {
  const { user } = useAuth();
  const theme = useTheme();
  const pollAccent = theme.colors.state.info;
  const styles = createStyles(theme, pollAccent);
  const [question, setQuestion] = useState('');
  const [questionSelection, setQuestionSelection] = useState({ start: 0, end: 0 });
  const [isQuestionFocused, setIsQuestionFocused] = useState(false);
  const [options, setOptions] = useState(['', '']);
  const [durationDays, setDurationDays] = useState<(typeof DURATION_OPTIONS)[number]>(3);
  const [submitting, setSubmitting] = useState(false);
  const questionInputRef = useRef<TextInput | null>(null);
  const {
    activeMatch,
    mentionSuggestions,
    hashtagSuggestions,
    visible,
    handleSelectMention,
    handleSelectHashtag,
    clear: clearAutocomplete,
  } = useEntityAutocomplete({
    text: question,
    selection: questionSelection,
    isFocused: isQuestionFocused,
    setText: setQuestion,
    setSelection: setQuestionSelection,
  });

  const refocusQuestionInput = useCallback(() => {
    requestAnimationFrame(() => {
      questionInputRef.current?.focus();
    });
  }, []);

  const handleSelectMentionSuggestion = useCallback(
    (item: Parameters<typeof handleSelectMention>[0]) => {
      handleSelectMention(item);
      refocusQuestionInput();
    },
    [handleSelectMention, refocusQuestionInput],
  );

  const handleSelectHashtagSuggestion = useCallback(
    (tag: string) => {
      handleSelectHashtag(tag);
      refocusQuestionInput();
    },
    [handleSelectHashtag, refocusQuestionInput],
  );

  const trimmedOptions = useMemo(() => options.map((option) => option.trim()), [options]);
  const filledOptions = trimmedOptions.filter(Boolean);
  const canSubmit =
    question.trim().length > 0 && filledOptions.length >= MIN_OPTIONS && !submitting;

  const handleOptionChange = (index: number, value: string) => {
    setOptions((current) =>
      current.map((option, optionIndex) => (optionIndex === index ? value : option)),
    );
  };

  const handleAddOption = () => {
    setOptions((current) => (current.length < MAX_OPTIONS ? [...current, ''] : current));
  };

  const handleRemoveOption = (index: number) => {
    setOptions((current) => {
      if (current.length <= MIN_OPTIONS) {
        return current;
      }
      return current.filter((_, optionIndex) => optionIndex !== index);
    });
  };

  const resetForm = () => {
    setQuestion('');
    setQuestionSelection({ start: 0, end: 0 });
    clearAutocomplete();
    setOptions(['', '']);
    setDurationDays(3);
  };

  const handleSubmit = async () => {
    if (!user) {
      alert('Du skal være logget ind');
      return;
    }

    const normalizedQuestion = question.trim();
    const normalizedOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);

    if (!normalizedQuestion) {
      alert('Skriv et spørgsmål');
      return;
    }

    if (normalizedOptions.length < MIN_OPTIONS) {
      alert(`Tilføj mindst ${MIN_OPTIONS} svarmuligheder`);
      return;
    }

    try {
      setSubmitting(true);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      const pollData = {
        question: normalizedQuestion,
        options: normalizedOptions.map((text, index) => ({
          id: `option_${Date.now()}_${index + 1}`,
          text,
        })),
        duration: durationDays,
        expires_at: expiresAt.toISOString(),
      };

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
          text: normalizedQuestion,
          poll_data: pollData,
          feed_targets: resolvedFeedTargets,
          ...(actor?.type === 'community' ? { community_id: actor.id } : {}),
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      if (data?.id) {
        const { mentionedProfiles } = await persistPostEntities(data.id, normalizedQuestion);

        void (async () => {
          if (mentionedProfiles.length > 0) {
            const [mentionNotificationsResult, mentionPushResult] = await Promise.allSettled([
              createMentionNotifications({
                mentionedUsernames: mentionedProfiles
                  .map((profile) => profile.username)
                  .filter((username): username is string => Boolean(username)),
                actorId: user.id,
                postId: data.id,
                entityType: 'post',
                entityId: data.id,
              }),
              triggerMentionPush({
                actorUserId: user.id,
                mentionedUserIds: mentionedProfiles.map((profile) => profile.id),
                entityType: 'post',
                entityId: data.id,
                postId: data.id,
                previewText: normalizedQuestion,
              }),
            ]);

            if (mentionNotificationsResult.status === 'rejected') {
              logger.warn('[PollComposer] createMentionNotifications failed:', {
                postId: data.id,
                error: mentionNotificationsResult.reason,
              });
            }

            if (mentionPushResult.status === 'rejected') {
              logger.warn('[PollComposer] triggerMentionPush failed:', {
                postId: data.id,
                error: mentionPushResult.reason,
              });
            } else if (!mentionPushResult.value) {
              logger.warn('[PollComposer] triggerMentionPush returned false', {
                postId: data.id,
              });
            }
          }

          if (actor?.type === 'community') {
            try {
              const didTriggerCommunityPush = await triggerCommunityPostPush(data.id);
              if (!didTriggerCommunityPush) {
                logger.warn('[PollComposer] triggerCommunityPostPush returned false', {
                  postId: data.id,
                });
              }
            } catch (error) {
              logger.warn('[PollComposer] triggerCommunityPostPush failed:', {
                postId: data.id,
                error,
              });
            }
          }
        })();
      }

      resetForm();
      onSuccess?.();
    } catch (err) {
      console.error('[PollComposer] Error creating poll', err);
      alert('Kunne ikke oprette afstemning');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.sectionCard}>
        <Text style={styles.label}>Spørgsmål</Text>
        <TextInput
          ref={questionInputRef}
          style={styles.questionInput}
          placeholder="Hvad vil du spørge om?"
          placeholderTextColor={theme.colors.text.secondary}
          value={question}
          onChangeText={setQuestion}
          selection={questionSelection}
          onSelectionChange={({ nativeEvent }) => setQuestionSelection(nativeEvent.selection)}
          onFocus={() => setIsQuestionFocused(true)}
          onBlur={() => {
            setTimeout(() => {
              setIsQuestionFocused(false);
              clearAutocomplete();
            }, 0);
          }}
          editable={!submitting}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <EntityAutocompleteList
          visible={visible}
          type={activeMatch?.type ?? null}
          mentionSuggestions={mentionSuggestions}
          hashtagSuggestions={hashtagSuggestions}
          onSelectMention={handleSelectMentionSuggestion}
          onSelectHashtag={handleSelectHashtagSuggestion}
        />
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>Svarmuligheder</Text>
          <Text style={styles.sectionMeta}>
            {filledOptions.length}/{MAX_OPTIONS}
          </Text>
        </View>

        <View style={styles.optionsList}>
          {options.map((option, index) => {
            const canRemove = index >= MIN_OPTIONS && options.length > MIN_OPTIONS;

            return (
              <View key={`poll-option-${index}`} style={styles.optionRow}>
                <View style={styles.optionIndexBadge}>
                  <Text style={styles.optionIndexText}>{index + 1}</Text>
                </View>
                <TextInput
                  style={styles.optionInput}
                  placeholder={`Svarmulighed ${index + 1}`}
                  placeholderTextColor={theme.colors.text.secondary}
                  value={option}
                  onChangeText={(value) => handleOptionChange(index, value)}
                  editable={!submitting}
                />
                {canRemove ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.removeOptionButton,
                      pressed && styles.optionButtonPressed,
                    ]}
                    onPress={() => handleRemoveOption(index)}
                    disabled={submitting}
                  >
                    <Ionicons name="close" size={16} color={pollAccent} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>

        {options.length < MAX_OPTIONS ? (
          <Pressable
            style={({ pressed }) => [styles.addOptionButton, pressed && styles.optionButtonPressed]}
            onPress={handleAddOption}
            disabled={submitting}
          >
            <Ionicons name="add-circle-outline" size={16} color={pollAccent} />
            <Text style={styles.addOptionText}>Tilføj svarmulighed</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.label}>Varighed</Text>
        <View style={styles.durationWrap}>
          {DURATION_OPTIONS.map((days) => {
            const selected = durationDays === days;

            return (
              <Pressable
                key={days}
                style={({ pressed }) => [
                  styles.durationChip,
                  selected && styles.durationChipSelected,
                  pressed && styles.durationChipPressed,
                ]}
                onPress={() => setDurationDays(days)}
                disabled={submitting}
              >
                <Text style={[styles.durationText, selected && styles.durationTextSelected]}>
                  {days}d
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={[styles.submitButtonWrap, !canSubmit && styles.submitButtonWrapDisabled]}>
        <View style={styles.submitButtonInner}>
          <PrimaryButton
            title={submitting ? 'Opretter...' : 'Opret afstemning'}
            onPress={handleSubmit}
            disabled={!canSubmit}
          />
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: Theme, pollAccent: string) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: theme.spacing[3],
      paddingTop: theme.spacing[3],
      paddingBottom: theme.spacing[5],
      gap: theme.spacing[3],
    },
    sectionCard: {
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing[2],
    },
    sectionMeta: {
      fontSize: 12,
      fontWeight: '600',
      color: pollAccent,
    },
    label: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    questionInput: {
      minHeight: 120,
      padding: theme.spacing[4],
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.subtle,
      fontSize: 15,
      lineHeight: 20,
      color: theme.colors.text.primary,
    },
    optionsList: {
      gap: theme.spacing[2],
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    optionIndexBadge: {
      width: 28,
      height: 28,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    optionIndexText: {
      fontSize: 12,
      fontWeight: '700',
      color: pollAccent,
    },
    optionInput: {
      flex: 1,
      minHeight: 48,
      paddingHorizontal: theme.spacing[4],
      paddingVertical: theme.spacing[3],
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.subtle,
      fontSize: 14,
      color: theme.colors.text.primary,
    },
    removeOptionButton: {
      width: 32,
      height: 32,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionButtonPressed: {
      opacity: 0.85,
    },
    addOptionButton: {
      marginTop: theme.spacing[3],
      minHeight: 38,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    addOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: pollAccent,
    },
    durationWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing[2],
    },
    durationChip: {
      minHeight: 38,
      minWidth: 52,
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    durationChipSelected: {
      borderColor: pollAccent,
      backgroundColor: theme.colors.bg.subtle,
    },
    durationChipPressed: {
      opacity: 0.88,
    },
    durationText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.text.primary,
    },
    durationTextSelected: {
      color: pollAccent,
    },
    submitButtonWrap: {
      marginTop: theme.spacing[1],
      padding: theme.spacing[2],
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.bg.card,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
    },
    submitButtonWrapDisabled: {
      backgroundColor: theme.colors.bg.elevated,
      borderColor: theme.colors.border.default,
    },
    submitButtonInner: {
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.subtle,
      borderWidth: 1,
      borderColor: pollAccent,
      padding: theme.spacing[1],
    },
  });
}
