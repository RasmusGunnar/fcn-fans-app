import React from 'react';
import {
  Text as RNText,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
} from 'react-native';

interface RenderTextWithEntitiesOptions {
  entityStyle?: StyleProp<TextStyle>;
  mentionLabels?: Record<string, string>;
  onPressTag?: (tag: string) => void | Promise<void>;
  onPressMention?: (username: string) => void | Promise<void>;
}

function buildPressHandler(
  handler: ((value: string) => void | Promise<void>) | undefined,
  value: string,
) {
  if (!handler) {
    return undefined;
  }

  return (event: GestureResponderEvent) => {
    event.stopPropagation();
    void handler(value);
  };
}

export function renderTextWithEntities(text: string, options: RenderTextWithEntitiesOptions = {}) {
  if (!text) return null;

  const { entityStyle, mentionLabels, onPressMention, onPressTag } = options;
  const parts = text.split(/([#@]\w+)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith('#')) {
      const tag = part.replace('#', '').toLowerCase();

      return (
        <RNText
          key={`${part}-${index}`}
          style={entityStyle}
          onPress={buildPressHandler(onPressTag, tag)}
        >
          {part}
        </RNText>
      );
    }

    if (part.startsWith('@')) {
      const username = part.replace('@', '').toLowerCase();
      const mentionLabel = mentionLabels?.[username]?.trim();

      return (
        <RNText
          key={`${part}-${index}`}
          style={entityStyle}
          onPress={buildPressHandler(onPressMention, username)}
        >
          {mentionLabel ? `@${mentionLabel}` : part}
        </RNText>
      );
    }

    return <RNText key={`${part}-${index}`}>{part}</RNText>;
  });
}
