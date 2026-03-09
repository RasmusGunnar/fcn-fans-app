import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchPollVotes, type PollVotesMap, votePoll } from '../services/pollService';
import { useTheme } from '../theme';
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

interface PollCardProps {
  pollData?: PollData | null;
  postId: string;
  profileMap?: ProfileMap;
}

export function PollCard({
  pollData,
  postId,
  profileMap,
}: PollCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const accentColor = theme.colors.state.info;
  const subtleAccent = theme.colors.bg.subtle;
  const subtleAccentStrong = theme.colors.border.subtle;
  const question = pollData?.question?.trim() || 'Afstemning';
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
    const data = await fetchPollVotes([postId]);
    const nextVotes = data[postId] || { optionVotes: {}, voters: {} };

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
  }, [postId]);

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
      .channel(`poll_votes:${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'poll_votes',
          filter: `post_id=eq.${postId}`,
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
  }, [loadVotes, postId]);

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
        const success = await votePoll(postId, optionId);
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
    [hasVoted, isExpired, postId, submitting],
  );

  return (
    <View style={styles.body}>
      <View style={styles.metadataRow}>
        <View style={[styles.badge, { backgroundColor: subtleAccentStrong, borderColor: subtleAccentStrong }]}>
          <Text variant="caption" style={[styles.badgeText, { color: accentColor }]}>
            {isExpired ? 'Afsluttet' : 'Afstemning'}
          </Text>
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
            const maxVotes = Math.max(0, ...Object.values(pollVotes.optionVotes || {}));
            const isWinner = votes > 0 && votes === maxVotes;

            return (
              <Pressable
                key={option.id || option.text}
                style={({ pressed }) => [
                  styles.optionCard,
                  {
                    backgroundColor: isWinner
                      ? subtleAccentStrong
                      : isSelected
                      ? subtleAccent
                      : isExpired
                        ? theme.colors.bg.card
                        : pressed
                          ? theme.colors.bg.subtle
                          : theme.colors.bg.card,
                    borderColor: isWinner
                      ? accentColor
                      : isSelected
                        ? accentColor
                        : theme.colors.border.subtle,
                    borderWidth: isSelected ? 1.5 : 1,
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

                        <View style={styles.optionRightMeta}>
                          {isExpired && isWinner ? (
                            <Text variant="caption" style={[styles.metaBadgeText, { color: accentColor }]}>Vinder</Text>
                          ) : !isExpired && isSelected ? (
                            <Text variant="caption" style={[styles.metaBadgeText, { color: accentColor }]}>Dit valg</Text>
                          ) : null}

                          {voterIds.length > 0 ? (
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
                                    size={24}
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
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
      </View>

      {isExpired ? (
        <Text variant="caption" color="secondary">
          Afstemning afsluttet
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
      paddingBottom: theme.spacing[2],
    },
    metadataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: theme.spacing[1],
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] / 2,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
    },
    badgeText: {
      fontWeight: '700',
      fontSize: 10,
      letterSpacing: 0.1,
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
      gap: theme.spacing[1],
    },
    optionCard: {
      borderWidth: 1,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      position: 'relative',
      minHeight: 44,
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
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[1] + 1,
      justifyContent: 'center',
    },
    optionTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 28,
      gap: theme.spacing[1] + 2,
    },
    optionMain: {
      flex: 1,
      gap: theme.spacing[1],
    },
    optionLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    metaBadgeText: {
      fontWeight: '700',
      fontSize: 10,
    },
    optionRightMeta: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      alignSelf: 'center',
      minWidth: 44,
    },
    avatarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarBubble: {
      width: 24,
      height: 24,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarBubbleOverlap: {
      marginLeft: -(theme.spacing[1] + 1),
    },
    avatarInitials: {
      fontWeight: '700',
      fontSize: 8,
    },
  });
}