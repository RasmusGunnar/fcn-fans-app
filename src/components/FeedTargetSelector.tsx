import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getMyCommunityRoles } from '../services/rbac';
import { Theme, useTheme } from '../theme';

type FeedTargetSelectorProps = {
  selectedTargets: string[];
  onChange: (targets: string[]) => void;
  defaultCommunityId?: string | null;
  accentColor?: string;
};

type FeedTargetOption = {
  value: string;
  label: string;
  icon: 'home' | 'people';
};

export function FeedTargetSelector({
  selectedTargets,
  onChange,
  defaultCommunityId: _defaultCommunityId,
  accentColor,
}: FeedTargetSelectorProps) {
  const theme = useTheme();
  const resolvedAccentColor = accentColor ?? theme.colors.primary;
  const styles = createStyles(theme, resolvedAccentColor);
  const [communityOptions, setCommunityOptions] = useState<FeedTargetOption[]>([]);
  const [loading, setLoading] = useState(false);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const roleMap = await getMyCommunityRoles();
      const communityIds = Object.keys(roleMap);

      if (communityIds.length === 0) {
        setCommunityOptions([]);
        return;
      }

      const { data, error } = await supabase
        .from('communities')
        .select('id, name')
        .in('id', communityIds)
        .order('name', { ascending: true });

      if (error) {
        setCommunityOptions([]);
        return;
      }

      const options: FeedTargetOption[] = (data || []).map((community) => ({
        value: `community:${community.id}`,
        label: community.name,
        icon: 'people',
      }));

      setCommunityOptions(options);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const options: FeedTargetOption[] = [
    { value: 'home', label: 'Home', icon: 'home' },
    ...communityOptions,
  ];

  const toggleTarget = (value: string) => {
    const isSelected = selectedTargets.includes(value);
    if (isSelected) {
      if (selectedTargets.length === 1) {
        return;
      }
      onChange(selectedTargets.filter((target) => target !== value));
      return;
    }
    onChange([...selectedTargets, value]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Vis i feed</Text>

      <View style={styles.optionsWrap}>
        {options.map((option) => {
          const isSelected = selectedTargets.includes(option.value);

          return (
            <Pressable
              key={option.value}
              onPress={() => toggleTarget(option.value)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
            >
              <Ionicons
                name={option.icon}
                size={14}
                color={isSelected ? resolvedAccentColor : theme.colors.text.secondary}
              />
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                {option.label}
              </Text>
              {isSelected && (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={resolvedAccentColor}
                  style={styles.checkIcon}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={resolvedAccentColor} />
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme, accentColor: string) {
  return StyleSheet.create({
    container: {
      marginBottom: theme.spacing[4],
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text.primary,
      marginBottom: theme.spacing[2],
    },
    optionsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing[2],
    },
    option: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing[1],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border.default,
      backgroundColor: theme.colors.bg.card,
      gap: theme.spacing[2],
    },
    optionSelected: {
      borderColor: accentColor,
      backgroundColor: theme.colors.bg.subtle,
    },
    optionPressed: {
      opacity: 0.85,
    },
    optionText: {
      fontSize: 13,
      color: theme.colors.text.primary,
      fontWeight: '500',
    },
    optionTextSelected: {
      color: accentColor,
      fontWeight: '600',
    },
    checkIcon: {
      marginLeft: theme.spacing[1],
    },
    loadingRow: {
      marginTop: theme.spacing[2],
      alignItems: 'flex-start',
    },
  });
}
