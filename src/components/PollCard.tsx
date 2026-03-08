import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchPollVotes, type PollVotesMap, votePoll } from '../services/pollService';
import { useTheme } from '../theme';
import type { Post } from '../types/post';
import type { ProfileMap } from '../utils/actor';
import { Avatar } from './Avatar';
import { PollVotersModal } from './PollVotersModal';
import { Text } from './ui/Text';

type PollOption = {
  id: string;
  text: string;
  votes?: number;
};

type PollData = {
  question?: string;
  options?: PollOption[];
  duration?: number;
  expires_at?: string;
};

type PollPost = Post & {
  poll_data?: PollData | null;
};

interface PollCardProps {
  post: PollPost;
  profileMap?: ProfileMap;
}

export function PollCard({
  post,
  profileMap,
}: PollCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const accentColor = theme.colors.state.info;
  const subtleAccent = 'rgba(59, 130, 246, 0.05)';
  const subtleAccentStrong = 'rgba(59, 130, 246, 0.12)';
  const pollData = post.poll_data;
  const question = pollData?.question?.trim() || post.text || 'Afstemning';
  const isExpired = Boolean(pollData?.expires_at && new Date(pollData.expires_at) < new Date());
  const options = useMemo(
    () => (Array.isArray(pollData?.options) ? pollData.options.filter(Boolean) : []),
    [pollData?.options],
  );
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [voterListVisible, setVoterListVisible] = useState(false);
  const [activeOptionVoters, setActiveOptionVoters] = useState<string[]>([]);
  const [pollVotes, setPollVotes] = useState<PollVotesMap[string]>({
    optionVotes: {},
    voters: {},
  });
  const [fetchedVoterProfiles, setFetchedVoterProfiles] = useState<ProfileMap>({});
  const [submitting, setSubmitting] = useState(false);
  const animatedBars = useRef<Record<string, Animated.Value>>({});

  const allVoterIds = useMemo(() => {
    const voterSet = new Set<string>();
    Object.values(pollVotes.voters).forEach((ids) => {
      ids.forEach((id) => voterSet.add(id));
    });
    return Array.from(voterSet);
  }, [pollVotes.voters]);

  const resolvedVoterProfiles = useMemo(() => {
    const nextMap: ProfileMap = {};
    allVoterIds.forEach((id) => {
      nextMap[id] = profileMap?.[id] ?? fetchedVoterProfiles[id] ?? { display_name: null, avatar_url: null };
    });
    return nextMap;
  }, [allVoterIds, fetchedVoterProfiles, profileMap]);

  const getAnimatedBar = useCallback((optionId: string) => {
    if (!animatedBars.current[optionId]) {
      animatedBars.current[optionId] = new Animated.Value(0);
    }

    return animatedBars.current[optionId];
  }, []);

  const loadVotes = useCallback(async () => {
    const data = await fetchPollVotes([post.id]);
    const nextVotes = data[post.id] || { optionVotes: {}, voters: {} };

    setPollVotes(nextVotes);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      const votedOptionId = Object.entries(nextVotes.voters).find(([, voterIds]) =>
        voterIds.includes(user.id),
      )?.[0];

      setSelectedOption(votedOptionId || null);
    } else {
      setSelectedOption(null);
    }
  }, [post.id]);

  useEffect(() => {
    options.forEach((option) => {
      if (!animatedBars.current[option.id]) {
        animatedBars.current[option.id] = new Animated.Value(0);
      }
    });
  }, [options]);

  useEffect(() => {
    loadVotes();
  }, [loadVotes]);

  useEffect(() => {
    let cancelled = false;

    const missingIds = allVoterIds.filter((id) => !profileMap?.[id] && !fetchedVoterProfiles[id]);

    if (missingIds.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const loadMissingProfiles = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', missingIds);

      if (error) {
        return;
      }

      if (cancelled || !data) {
        return;
      }

      const nextProfiles: ProfileMap = {};
      data.forEach((profile) => {
        nextProfiles[profile.id] = {
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        };
      });

      setFetchedVoterProfiles((current) => ({
        ...current,
        ...nextProfiles,
      }));
    };

    void loadMissingProfiles();

    return () => {
      cancelled = true;
    };
  }, [allVoterIds, fetchedVoterProfiles, profileMap]);

  useEffect(() => {
    const channel = supabase
      .channel(`poll_votes:${post.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'poll_votes',
          filter: `post_id=eq.${post.id}`,
        },
        () => {
          loadVotes();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [loadVotes, post.id]);

  const totalVotes = useMemo(
    () => Object.values(pollVotes.optionVotes).reduce((sum, votes) => sum + Math.max(0, votes || 0), 0),
    [pollVotes.optionVotes],
  );

  const hasVoted = Boolean(selectedOption);

  useEffect(() => {
    const animations = options.map((option) => {
      const votes = Math.max(0, pollVotes.optionVotes[option.id] ?? 0);
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

      return Animated.timing(getAnimatedBar(option.id), {
        toValue: percentage,
        duration: 280,
        useNativeDriver: false,
      });
    });

    if (animations.length > 0) {
      Animated.parallel(animations).start();
    }
  }, [getAnimatedBar, options, pollVotes.optionVotes, totalVotes]);

  const handleVote = useCallback(
    async (optionId: string) => {
      if (submitting || hasVoted || isExpired) {
        return;
      }

      setSubmitting(true);

      try {
        const success = await votePoll(post.id, optionId);
        if (!success) {
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        setSelectedOption(optionId);
        setPollVotes((current) => {
          const nextOptionVotes = {
            ...current.optionVotes,
            [optionId]: (current.optionVotes[optionId] || 0) + 1,
          };

          const nextVoters = {
            ...current.voters,
            [optionId]: user?.id
              ? Array.from(new Set([...(current.voters[optionId] || []), user.id]))
              : current.voters[optionId] || [],
          };

          return {
            optionVotes: nextOptionVotes,
            voters: nextVoters,
          };
        });
      } finally {
        setSubmitting(false);
      }
    },
    [hasVoted, isExpired, post.id, submitting],
  );

  return (
    <View style={styles.body}>
      <View style={styles.metadataRow}>
        <View style={[styles.badge, { backgroundColor: subtleAccent, borderColor: 'transparent' }]}>
          <Text variant="caption" style={[styles.badgeText, { color: accentColor }]}>Poll</Text>
        </View>
        <Text variant="caption" color="secondary" style={styles.totalVotesText}>
          {totalVotes} stemme{totalVotes === 1 ? '' : 'r'}
        </Text>
      </View>

      <Text variant="bodyBold" style={styles.questionText}>
        {question}
      </Text>

      <View style={styles.optionsList}>
          {options.map((option) => {
            const votes = Math.max(0, pollVotes.optionVotes[option.id] ?? 0);
            const voterIds = pollVotes.voters[option.id] || [];
            const visibleVoters = voterIds.slice(0, 3);
            const extraVoterCount = Math.max(0, voterIds.length - visibleVoters.length);
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            const animatedWidth = getAnimatedBar(option.id).interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            });
            const isSelected = selectedOption === option.id;

            return (
              <Pressable
                key={option.id || option.text}
                style={({ pressed }) => [
                  styles.optionCard,
                  {
                    backgroundColor: isSelected
                      ? subtleAccent
                      : pressed
                        ? theme.colors.bg.subtle
                        : theme.colors.bg.card,
                    borderColor: isSelected ? subtleAccentStrong : theme.colors.border.subtle,
                  },
                ]}
                onPress={() => handleVote(option.id)}
                disabled={hasVoted || submitting || isExpired}
              >
                <View style={styles.optionFillTrack} pointerEvents="none">
                  <Animated.View
                    style={[
                      styles.optionFill,
                      {
                        backgroundColor: accentColor,
                        width: animatedWidth,
                        opacity: totalVotes > 0 ? (isSelected ? 0.08 : 0.03) : 0,
                      },
                    ]}
                  />
                </View>

                <View style={styles.optionContent}>
                  <View style={styles.optionTopRow}>
                    <View
                      style={[
                        styles.radioOuter,
                        {
                          borderColor: isSelected ? accentColor : theme.colors.border.subtle,
                          backgroundColor: isSelected ? subtleAccent : theme.colors.bg.subtle,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.radioInner,
                          {
                            backgroundColor: accentColor,
                            opacity: isSelected ? 1 : 0,
                            transform: [{ scale: isSelected ? 1 : 0.6 }],
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.optionMain}>
                      <View style={styles.optionLabelRow}>
                        <Text variant="body" style={styles.optionText}>
                          {option.text}
                        </Text>
                        <Text
                          variant="caption"
                          style={[
                            styles.percentageText,
                            { color: isSelected ? accentColor : theme.colors.text.secondary },
                          ]}
                        >
                          {percentage}%
                        </Text>
                      </View>

                      <View style={styles.barTrack}>
                        <Animated.View
                          style={[
                            styles.barFill,
                            {
                              backgroundColor: accentColor,
                              width: animatedWidth,
                              opacity: totalVotes > 0 ? 0.86 : 0.16,
                            },
                          ]}
                        />
                      </View>
                      {voterIds.length > 0 ? (
                        <View style={styles.optionFooter}>
                          <Pressable
                            style={styles.avatarRow}
                            onPress={() => {
                              setActiveOptionVoters(voterIds);
                              setVoterListVisible(true);
                            }}
                          >
                            {visibleVoters.map((voterId, index) => (
                              <View
                                key={`${option.id}:${voterId}`}
                                style={[
                                  styles.avatarBubble,
                                  index > 0 && styles.avatarBubbleOverlap,
                                  {
                                    borderColor: theme.colors.bg.card,
                                    backgroundColor: theme.colors.bg.card,
                                  },
                                ]}
                              >
                                <Avatar
                                  userId={voterId}
                                  avatarUrl={resolvedVoterProfiles[voterId]?.avatar_url}
                                  size={20}
                                  label={resolvedVoterProfiles[voterId]?.display_name || 'Fan'}
                                />
                              </View>
                            ))}

                            {extraVoterCount > 0 ? (
                              <View
                                style={[
                                  styles.avatarBubble,
                                  visibleVoters.length > 0 && styles.avatarBubbleOverlap,
                                  {
                                    borderColor: theme.colors.bg.card,
                                    backgroundColor: subtleAccentStrong,
                                  },
                                ]}
                              >
                                <Text variant="caption" style={[styles.avatarInitials, { color: accentColor }]}>
                                  +{extraVoterCount}
                                </Text>
                              </View>
                            ) : null}
                          </Pressable>

                          {voterIds.length > 10 ? (
                            <Text variant="caption" color="secondary" style={styles.moreFansText}>
                              + flere fans
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
      </View>

      {isExpired ? (
        <Text variant="caption" color="secondary">
          Afstemning lukket
        </Text>
      ) : null}

      <PollVotersModal
        visible={voterListVisible}
        voterIds={activeOptionVoters}
        voterProfiles={resolvedVoterProfiles}
        onClose={() => setVoterListVisible(false)}
      />
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    body: {
      gap: theme.spacing[2],
    },
    metadataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing[1] + 1,
      paddingVertical: 1,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
    },
    badgeText: {
      fontWeight: '700',
      fontSize: 8,
      letterSpacing: 0.12,
    },
    totalVotesText: {
      fontWeight: '400',
      fontSize: 10,
      opacity: 0.44,
    },
    questionText: {
      color: theme.colors.text.primary,
      fontWeight: '800',
      fontSize: 18,
      lineHeight: 24,
    },
    optionsList: {
      gap: theme.spacing[1] + 2,
    },
    optionCard: {
      borderWidth: 1,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      position: 'relative',
      minHeight: 58,
    },
    optionFillTrack: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
    },
    optionFill: {
      height: '100%',
      borderRadius: theme.radius.md,
    },
    optionContent: {
      gap: 5,
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[2] - 1,
    },
    optionTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing[1] + 2,
      minHeight: 24,
    },
    optionMain: {
      flex: 1,
      gap: 2,
    },
    optionLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioInner: {
      width: 9,
      height: 9,
      borderRadius: theme.radius.pill,
    },
    optionText: {
      color: theme.colors.text.primary,
      fontWeight: '600',
      lineHeight: 20,
      flex: 1,
    },
    percentageText: {
      minWidth: 32,
      textAlign: 'right',
      fontWeight: '600',
      fontSize: 9,
    },
    barTrack: {
      height: 3,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.bg.subtle,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: theme.radius.pill,
    },
    optionFooter: {
      minHeight: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: theme.spacing[2],
      marginTop: theme.spacing[1] - 1,
    },
    avatarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 20,
    },
    avatarBubble: {
      width: 20,
      height: 20,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarBubbleOverlap: {
      marginLeft: -theme.spacing[1],
    },
    avatarInitials: {
      fontWeight: '700',
      fontSize: 9,
    },
    moreFansText: {
      fontSize: 10,
      opacity: 0.56,
    },
  });
}