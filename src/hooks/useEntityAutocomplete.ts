import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  searchMentionSuggestions,
  type MentionSuggestion,
} from '../services/mentionAutocompleteApi';
import { searchHashtagSuggestions } from '../services/hashtagAutocompleteApi';
import {
  getActiveEntityMatch,
  replaceActiveEntity,
  type ActiveEntityMatch,
} from '../utils/entityAutocomplete';

type Selection = {
  start: number;
  end: number;
};

type Options = {
  text: string;
  selection: Selection;
  isFocused: boolean;
  setText: (text: string) => void;
  setSelection: (selection: Selection) => void;
  includeCommunityMentions?: boolean;
};

const AUTOCOMPLETE_DEBOUNCE_MS = 150;

export function useEntityAutocomplete({
  text,
  selection,
  isFocused,
  setText,
  setSelection,
  includeCommunityMentions = false,
}: Options) {
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionSuggestion[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);

  const clear = useCallback(() => {
    setMentionSuggestions([]);
    setHashtagSuggestions([]);
  }, []);

  const activeMatch = useMemo<ActiveEntityMatch>(() => {
    if (!isFocused || selection.start !== selection.end) {
      return null;
    }

    return getActiveEntityMatch(text, selection.start);
  }, [isFocused, selection.end, selection.start, text]);

  useEffect(() => {
    if (!activeMatch || activeMatch.query.length < 1) {
      clear();
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (activeMatch.type === 'mention') {
        const nextSuggestions = await searchMentionSuggestions(activeMatch.query, {
          includeCommunities: includeCommunityMentions,
        });
        if (!cancelled) {
          setMentionSuggestions(nextSuggestions);
          setHashtagSuggestions([]);
        }
        return;
      }

      const nextSuggestions = await searchHashtagSuggestions(activeMatch.query);
      if (!cancelled) {
        setHashtagSuggestions(nextSuggestions);
        setMentionSuggestions([]);
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeMatch, clear, includeCommunityMentions]);

  const applyReplacement = useCallback(
    (replacement: string) => {
      if (!activeMatch) {
        return;
      }

      const next = replaceActiveEntity(text, activeMatch, replacement);
      setText(next.text);
      setSelection({ start: next.cursor, end: next.cursor });
      clear();
    },
    [activeMatch, clear, setSelection, setText, text],
  );

  const handleSelectMention = useCallback(
    (item: MentionSuggestion) => {
      applyReplacement(`@${item.handle}`);
    },
    [applyReplacement],
  );

  const handleSelectHashtag = useCallback(
    (tag: string) => {
      applyReplacement(`#${tag}`);
    },
    [applyReplacement],
  );

  const visible = Boolean(
    isFocused &&
      activeMatch &&
      activeMatch.query.length >= 1 &&
      ((activeMatch.type === 'mention' && mentionSuggestions.length > 0) ||
        (activeMatch.type === 'hashtag' && hashtagSuggestions.length > 0)),
  );

  return {
    activeMatch,
    mentionSuggestions,
    hashtagSuggestions,
    visible,
    handleSelectMention,
    handleSelectHashtag,
    clear,
  };
}
