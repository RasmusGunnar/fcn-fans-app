import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOptimisticCommentLikeToggle, type CommentLikeTreeItem } from '../commentLikeState';

function makeTree(): CommentLikeTreeItem[] {
  return [
    {
      id: 'comment-1',
      likeCount: 2,
      likedByMe: false,
      replies: [
        {
          id: 'reply-1',
          likeCount: 1,
          likedByMe: true,
        },
      ],
    },
    {
      id: 'comment-2',
      likeCount: 0,
      likedByMe: false,
      replies: [],
    },
  ];
}

test('optimistically likes a top-level comment', () => {
  const previous = makeTree();
  const result = applyOptimisticCommentLikeToggle(previous, 'comment-1');

  assert.equal(result.toggledComment?.id, 'comment-1');
  assert.equal(result.toggledComment?.likedByMe, true);
  assert.equal(result.toggledComment?.likeCount, 3);
  assert.equal(result.comments[0].likedByMe, true);
  assert.equal(result.comments[0].likeCount, 3);

  assert.equal(previous[0].likedByMe, false);
  assert.equal(previous[0].likeCount, 2);
});

test('optimistically unlikes a nested reply', () => {
  const previous = makeTree();
  const result = applyOptimisticCommentLikeToggle(previous, 'reply-1');
  const reply = result.comments[0].replies?.[0];

  assert.equal(result.toggledComment?.id, 'reply-1');
  assert.equal(result.toggledComment?.likedByMe, false);
  assert.equal(result.toggledComment?.likeCount, 0);
  assert.equal(reply?.likedByMe, false);
  assert.equal(reply?.likeCount, 0);

  assert.equal(previous[0].replies?.[0].likedByMe, true);
  assert.equal(previous[0].replies?.[0].likeCount, 1);
});

test('unlike never makes the visible count negative', () => {
  const previous: CommentLikeTreeItem[] = [
    {
      id: 'comment-1',
      likeCount: 0,
      likedByMe: true,
    },
  ];

  const result = applyOptimisticCommentLikeToggle(previous, 'comment-1');

  assert.equal(result.toggledComment?.likedByMe, false);
  assert.equal(result.toggledComment?.likeCount, 0);
});

test('unknown comment id leaves state available for rollback', () => {
  const previous = makeTree();
  const result = applyOptimisticCommentLikeToggle(previous, 'missing-comment');

  assert.equal(result.toggledComment, null);
  assert.deepEqual(result.comments, previous);
});
