import { getActiveEntityMatch, replaceActiveEntity } from '../entityAutocomplete';

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertActiveMatch(
  text: string,
  cursor: number,
  expected: {
    type: 'mention' | 'hashtag';
    query: string;
    start: number;
    end: number;
  },
) {
  const match = getActiveEntityMatch(text, cursor);

  assert(match !== null, 'Expected an active entity match');
  assertEqual(match.type, expected.type, 'Unexpected entity type');
  assertEqual(match.query, expected.query, 'Unexpected entity query');
  assertEqual(match.start, expected.start, 'Unexpected entity start');
  assertEqual(match.end, expected.end, 'Unexpected entity end');

  return match;
}

describe('getActiveEntityMatch', () => {
  it('detects @ras at cursor end', () => {
    const text = 'Hej @ras';

    assertActiveMatch(text, text.length, {
      type: 'mention',
      query: 'ras',
      start: 4,
      end: 8,
    });
  });

  it('detects #tifo at cursor end', () => {
    const text = 'Hej #tifo';

    assertActiveMatch(text, text.length, {
      type: 'hashtag',
      query: 'tifo',
      start: 4,
      end: 9,
    });
  });

  it('returns null outside entity', () => {
    const text = 'Hej @ras i dag';

    assertEqual(
      getActiveEntityMatch(text, text.length),
      null,
      'Expected no active entity when the cursor is outside the token',
    );
  });

  it('returns null inside email-like text', () => {
    const text = 'mail test@example.com';
    const cursor = text.indexOf('.com');

    assertEqual(
      getActiveEntityMatch(text, cursor),
      null,
      'Expected no active entity inside an email-like token',
    );
  });

  it('supports entity in middle of sentence', () => {
    const text = 'Hej @ras i dag';
    const cursor = text.indexOf(' i');

    assertActiveMatch(text, cursor, {
      type: 'mention',
      query: 'ras',
      start: 4,
      end: 8,
    });
  });

  it('stops when whitespace breaks token', () => {
    const text = 'Hej @ra su';

    assertEqual(
      getActiveEntityMatch(text, text.length),
      null,
      'Expected no active entity after whitespace breaks the token',
    );
  });
});

describe('replaceActiveEntity', () => {
  it('replaces active @ra with @rasmus', () => {
    const text = 'Hej @ra';
    const match = assertActiveMatch(text, text.length, {
      type: 'mention',
      query: 'ra',
      start: 4,
      end: 7,
    });

    const next = replaceActiveEntity(text, match, '@rasmus');

    assertEqual(next.text, 'Hej @rasmus ', 'Expected mention replacement to be inserted');
  });

  it('replaces active #ti with #tifo', () => {
    const text = 'Hej #ti';
    const match = assertActiveMatch(text, text.length, {
      type: 'hashtag',
      query: 'ti',
      start: 4,
      end: 7,
    });

    const next = replaceActiveEntity(text, match, '#tifo');

    assertEqual(next.text, 'Hej #tifo ', 'Expected hashtag replacement to be inserted');
  });

  it('preserves text before and after token', () => {
    const text = 'Hej @ra og velkommen';
    const cursor = text.indexOf(' og');
    const match = assertActiveMatch(text, cursor, {
      type: 'mention',
      query: 'ra',
      start: 4,
      end: 7,
    });

    const next = replaceActiveEntity(text, match, '@rasmus');

    assertEqual(
      next.text,
      'Hej @rasmus og velkommen',
      'Expected replacement to preserve surrounding text',
    );
  });

  it('returns correct new cursor position', () => {
    const text = 'Hej @ra';
    const match = assertActiveMatch(text, text.length, {
      type: 'mention',
      query: 'ra',
      start: 4,
      end: 7,
    });

    const next = replaceActiveEntity(text, match, '@rasmus');

    assertEqual(next.cursor, 12, 'Expected cursor to move to the end of the inserted entity');
  });
});
