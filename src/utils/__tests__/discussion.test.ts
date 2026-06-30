import assert from 'node:assert/strict';
import {
  DISCUSSION_MAX_IMAGES,
  extractPrimaryUrl,
  groupDiscussionReplies,
  splitDiscussionTextByUrls,
  validateDiscussionMediaSelection,
} from '../discussion';
import type { PickedMedia } from '../../lib/mediaPicker';
import type { DiscussionPost } from '../../types/discussion';

function image(index: number): PickedMedia {
  return {
    uri: `file:///image-${index}.jpg`,
    type: 'image',
    base64: 'abc',
    mimeType: 'image/jpeg',
  };
}

function video(duration = 1000): PickedMedia {
  return {
    uri: 'file:///video.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    duration,
  };
}

function post(id: string, parentPostId: string | null = null): DiscussionPost {
  return {
    id,
    threadId: 'thread-1',
    parentPostId,
    authorId: 'user-1',
    author: { id: 'user-1', displayName: 'User A' },
    body: id,
    createdAt: `2026-06-29T10:00:0${id === 'reply-1' ? 1 : 0}.000Z`,
    updatedAt: '2026-06-29T10:00:00.000Z',
    media: [],
    linkPreview: null,
    reactionCount: 0,
    likedByMe: false,
    replies: [],
  };
}

assert.equal(extractPrimaryUrl('Se https://fcn.dk/nyheder/test.'), 'https://fcn.dk/nyheder/test');
assert.equal(extractPrimaryUrl('ingen link her'), null);

const boldSegments = splitDiscussionTextByUrls('Se https://bold.dk');
assert.deepEqual(boldSegments, [
  { type: 'text', text: 'Se ' },
  { type: 'url', text: 'https://bold.dk', url: 'https://bold.dk/' },
]);

const punctuationSegments = splitDiscussionTextByUrls('Læs https://fcn.dk/nyheder/test.');
assert.deepEqual(punctuationSegments, [
  { type: 'text', text: 'Læs ' },
  { type: 'url', text: 'https://fcn.dk/nyheder/test', url: 'https://fcn.dk/nyheder/test' },
  { type: 'text', text: '.' },
]);

const multipleUrlSegments = splitDiscussionTextByUrls('A https://bold.dk og https://fcn.dk');
assert.equal(multipleUrlSegments.filter((segment) => segment.type === 'url').length, 2);

assert.equal(
  validateDiscussionMediaSelection(
    Array.from({ length: DISCUSSION_MAX_IMAGES }, (_, index) => image(index)),
  ),
  null,
);
assert.match(
  validateDiscussionMediaSelection([...Array.from({ length: 5 }, (_, index) => image(index))]) ??
    '',
  /højest/,
);
assert.match(validateDiscussionMediaSelection([image(1), video()]) ?? '', /enten billeder/);
assert.match(validateDiscussionMediaSelection([video(61_000)]) ?? '', /60 sekunder/);

const grouped = groupDiscussionReplies([post('reply-1', 'root-1'), post('root-1')]);
assert.equal(grouped.length, 1);
assert.equal(grouped[0].id, 'root-1');
assert.equal(grouped[0].replies.length, 1);
assert.equal(grouped[0].replies[0].id, 'reply-1');

console.log('discussion utils tests passed');
