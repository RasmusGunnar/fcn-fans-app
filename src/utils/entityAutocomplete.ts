export type ActiveEntityMatch =
  | {
      type: 'mention' | 'hashtag';
      query: string;
      start: number;
      end: number;
    }
  | null;

const ENTITY_QUERY_REGEX = /(^|[^A-Za-z0-9_.@#])([@#])([A-Za-z0-9_]*)$/;
const ENTITY_BODY_REGEX = /[A-Za-z0-9_]/;
const NO_SPACE_BEFORE_REGEX = /[.,!?;:)\]}]/;

export function getActiveEntityMatch(text: string, cursor: number): ActiveEntityMatch {
  if (!text || cursor < 0 || cursor > text.length) {
    return null;
  }

  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(ENTITY_QUERY_REGEX);

  if (!match) {
    return null;
  }

  const symbol = match[2];
  const query = match[3] ?? '';
  const start = cursor - (symbol.length + query.length);
  let end = cursor;

  while (end < text.length && ENTITY_BODY_REGEX.test(text[end])) {
    end += 1;
  }

  return {
    type: symbol === '@' ? 'mention' : 'hashtag',
    query,
    start,
    end,
  };
}

export function replaceActiveEntity(
  text: string,
  match: Exclude<ActiveEntityMatch, null>,
  replacement: string,
): { text: string; cursor: number } {
  const before = text.slice(0, match.start);
  const after = text.slice(match.end);
  const nextChar = after[0] ?? '';
  const needsTrailingSpace =
    nextChar.length === 0 ||
    (!/\s/.test(nextChar) && !NO_SPACE_BEFORE_REGEX.test(nextChar));
  const inserted = needsTrailingSpace ? `${replacement} ` : replacement;
  const nextText = `${before}${inserted}${after}`;
  const nextCursor = before.length + inserted.length;

  return {
    text: nextText,
    cursor: nextCursor,
  };
}
