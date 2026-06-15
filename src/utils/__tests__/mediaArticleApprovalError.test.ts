import assert from 'node:assert/strict';
import test from 'node:test';
import { describeMediaArticleApprovalError } from '../mediaArticleApprovalError';

test('approval diagnostics identify a missing RPC', () => {
  const diagnostic = describeMediaArticleApprovalError({
    code: 'PGRST202',
    message: 'Could not find the function public.approve_media_article_candidate',
    details: 'Searched for the function in the schema cache.',
  });

  assert.equal(diagnostic.code, 'PGRST202');
  assert.equal(diagnostic.summary, 'Godkendelsesfunktionen mangler i databasen.');
  assert.match(diagnostic.debugMessage, /PGRST202/);
  assert.match(diagnostic.debugMessage, /schema cache/);
});

test('approval diagnostics expose schema type mismatches', () => {
  const diagnostic = describeMediaArticleApprovalError({
    code: '42804',
    message: 'column "feed_targets" is of type jsonb but expression is of type text[]',
    hint: 'You will need to rewrite or cast the expression.',
  });

  assert.equal(diagnostic.summary, 'Databasens felttyper matcher ikke godkendelsesfunktionen.');
  assert.match(diagnostic.debugMessage, /feed_targets/);
  assert.match(diagnostic.debugMessage, /rewrite or cast/);
});

test('approval diagnostics preserve RPC stage details', () => {
  const diagnostic = describeMediaArticleApprovalError({
    code: '23514',
    message: 'media article approval failed at post_validation',
    details: 'candidate_id=candidate-1',
  });

  assert.equal(diagnostic.summary, 'Artiklen opfylder ikke databasekravene.');
  assert.match(diagnostic.debugMessage, /post_validation/);
  assert.match(diagnostic.debugMessage, /candidate-1/);
});
