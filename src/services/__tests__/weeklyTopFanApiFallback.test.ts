import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  WEEKLY_TOP_FAN_FALLBACK_STALENESS_DAYS,
  selectWeeklyTopFanDisplayRow,
} from '../weeklyTopFanApiFallback';

type TestWeeklyTopFanRow = {
  id: string;
  week_start_date: string;
};

function row(id: string, weekStartDate: string): TestWeeklyTopFanRow {
  return {
    id,
    week_start_date: weekStartDate,
  };
}

test('expected row exists and is selected before latest fallback', () => {
  const expected = row('expected', '2026-06-01');
  const latest = row('latest', '2026-05-18');

  const selection = selectWeeklyTopFanDisplayRow({
    expectedRow: expected,
    latestRow: latest,
    expectedWeekStart: '2026-06-01',
  });

  assert.equal(selection.row, expected);
  assert.equal(selection.isFallbackLatest, false);
  assert.equal(selection.fallbackAgeDays, null);
  assert.equal(selection.rejectionReason, null);
});

test('expected row missing and latest within four weeks is selected as fallback', () => {
  const latest = row('latest', '2026-05-18');

  const selection = selectWeeklyTopFanDisplayRow({
    expectedRow: null,
    latestRow: latest,
    expectedWeekStart: '2026-06-01',
  });

  assert.equal(selection.row, latest);
  assert.equal(selection.isFallbackLatest, true);
  assert.equal(selection.fallbackAgeDays, 14);
  assert.equal(selection.rejectionReason, null);
});

test('expected row missing and latest older than four weeks is rejected', () => {
  const latest = row('too-old', '2026-04-27');

  const selection = selectWeeklyTopFanDisplayRow({
    expectedRow: null,
    latestRow: latest,
    expectedWeekStart: '2026-06-01',
  });

  assert.equal(selection.row, null);
  assert.equal(selection.isFallbackLatest, false);
  assert.equal(selection.fallbackAgeDays, WEEKLY_TOP_FAN_FALLBACK_STALENESS_DAYS + 7);
  assert.equal(selection.rejectionReason, 'older_than_cap');
});

test('future latest row is not used before its expected publish window', () => {
  const latest = row('future', '2026-06-08');

  const selection = selectWeeklyTopFanDisplayRow({
    expectedRow: null,
    latestRow: latest,
    expectedWeekStart: '2026-06-01',
  });

  assert.equal(selection.row, null);
  assert.equal(selection.isFallbackLatest, false);
  assert.equal(selection.fallbackAgeDays, -7);
  assert.equal(selection.rejectionReason, 'future_week');
});

test('FeedItemRenderer still renders WeeklyTopFanCard for weekly_top_fan items', () => {
  const rendererSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/feed/FeedItemRenderer.tsx'),
    'utf8',
  );

  assert.match(rendererSource, /case 'weekly_top_fan':[\s\S]*?<WeeklyTopFanCard/);
});
