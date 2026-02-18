import React, { Children, isValidElement } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { contentPaddingX } from '../feed/FeedCardShell';

export interface CardMediaProps {
  /** Aspect ratio for the media container. Pass `null` to disable. Default 16/9. */
  aspectRatio?: number | null;
  /** When true, applies negative horizontal margins to break out of card content padding. */
  fullBleed?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

const DEFAULT_RATIO = 16 / 9;

/**
 * Resolve the raw prop to a safe numeric ratio or `undefined` (= no ratio).
 *  - `null`          → undefined (opt-out)
 *  - `undefined`     → DEFAULT_RATIO
 *  - NaN / <= 0      → DEFAULT_RATIO
 *  - valid number    → that number
 */
function resolveRatio(raw: number | null | undefined): number | undefined {
  if (raw === null) return undefined;
  if (raw === undefined) return DEFAULT_RATIO;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RATIO;
  return raw;
}

/**
 * Wrapper that gives media content a deterministic height via `aspectRatio`.
 *
 * When `fullBleed` is true, uses a two-view pattern (matching FanPostCard):
 *   - Outer view: handles bleed (negative margins + alignSelf: stretch)
 *   - Inner view: handles sizing (width: 100% + aspectRatio)
 * This avoids a Yoga quirk where aspectRatio resolves before margin-based
 * stretching, which can leave media inset instead of edge-to-edge.
 *
 * If the single child already carries its own absolute height or aspectRatio
 * the wrapper skips enforcing a ratio so there is no double-constraint.
 */
export function CardMedia({ aspectRatio: rawRatio, fullBleed, style, children }: CardMediaProps) {
  let ratio = resolveRatio(rawRatio);

  // Safety: if the sole child already defines its own sizing, let it win.
  if (ratio !== undefined) {
    const arr = Children.toArray(children);
    if (arr.length === 1 && isValidElement(arr[0])) {
      const flat = StyleSheet.flatten(
        (arr[0] as React.ReactElement<{ style?: StyleProp<ViewStyle> }>).props?.style,
      );
      if (flat) {
        const hasOwnRatio = flat.aspectRatio != null;
        const hasAbsoluteHeight = typeof flat.height === 'number';
        if (hasOwnRatio || hasAbsoluteHeight) {
          ratio = undefined;
        }
      }
    }
  }

  if (fullBleed) {
    // Two-view pattern: outer handles bleed, inner handles aspect ratio.
    // This matches the proven FanPostCard mediaOuter + mediaContainer approach
    // and avoids Yoga computing aspectRatio before margin-stretch.
    return (
      <View
        style={[
          {
            marginHorizontal: -contentPaddingX,
            alignSelf: 'stretch' as const,
            overflow: 'hidden' as const,
          },
          style,
        ]}
      >
        <View
          style={[
            { width: '100%' as const },
            ratio !== undefined ? { aspectRatio: ratio } : undefined,
          ]}
        >
          {children}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        { width: '100%' as const, overflow: 'hidden' as const },
        ratio !== undefined ? { aspectRatio: ratio } : undefined,
        style,
      ]}
    >
      {children}
    </View>
  );
}
