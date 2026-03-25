import React from 'react';
import {
  Text as RNText,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
} from 'react-native';

interface RenderTextWithHashtagsOptions {
  entityStyle?: StyleProp<TextStyle>;
}

export function renderTextWithHashtags(
  text: string,
  onPressTag: (tag: string) => void | Promise<void>,
  options: RenderTextWithHashtagsOptions = {},
) {
  if (!text) return null;

  const { entityStyle } = options;
  const parts = text.split(/(#\w+)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (!part.startsWith('#')) {
      return <RNText key={`${part}-${index}`}>{part}</RNText>;
    }

    const tag = part.replace('#', '').toLowerCase();

    return (
      <RNText
        key={`${part}-${index}`}
        style={entityStyle}
        onPress={(event: GestureResponderEvent) => {
          event.stopPropagation();
          void onPressTag(tag);
        }}
      >
        {part}
      </RNText>
    );
  });
}
