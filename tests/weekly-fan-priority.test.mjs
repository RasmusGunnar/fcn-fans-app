import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { URL } from 'node:url';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/utils/fanExperience.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    },
  ).outputText,
  { module, exports: module.exports },
);
const { weeklyFanPhase, placeWeeklyFan } = module.exports;
const now = Date.parse('2026-09-15T12:00:00Z');
const ago = (hours) => new Date(now - hours * 3600000).toISOString();
test('winner moves down as new content arrives without being pinned', () => {
  const award = { id: 'winner', award: true, kind: 'weekly_top_fan', createdAt: ago(48) };
  const old = [1, 2, 3, 4].map((id) => ({ id, kind: 'post', createdAt: ago(72) }));
  const initial = placeWeeklyFan([award, ...old], (item) => item, now);
  const incoming = [5, 6, 7, 8].map((id) => ({ id, kind: 'post', createdAt: ago(1) }));
  const updated = placeWeeklyFan([...incoming, award, ...old], (item) => item, now);
  assert.ok(updated.indexOf(award) > initial.indexOf(award));
  for (const item of incoming) assert.ok(updated.indexOf(item) < updated.indexOf(award));
});
test('existing 30-hour fresh window expires to compact, invalid dates remain compact', () => {
  assert.equal(weeklyFanPhase(ago(29.99), now), 'fresh');
  assert.equal(weeklyFanPhase(ago(30), now), 'compact');
  assert.equal(weeklyFanPhase(ago(48), now), 'compact');
  for (const date of [null, undefined, 'invalid', ago(-1)])
    assert.equal(weeklyFanPhase(date, now), 'compact');
});
for (const age of [2, 48])
  test(`winner aged ${age} hours stays below fresh posts and live matches`, () => {
    const award = { id: 'winner', award: true, kind: 'weekly_top_fan', createdAt: ago(age) };
    const old = [1, 2, 3].map((id) => ({ id, kind: 'post', createdAt: ago(72) }));
    const fresh = { id: 'fresh', kind: 'post', createdAt: ago(1) };
    const live = { id: 'live', kind: 'match', startsAt: ago(0.5), endsAt: ago(-1) };
    const ranked = [award, ...old, fresh, live];
    const result = placeWeeklyFan(ranked, (item) => item, now);
    assert.ok(result.indexOf(award) > result.indexOf(fresh));
    assert.ok(result.indexOf(award) > result.indexOf(live));
    assert.equal(ranked[0], award, 'placement does not mutate its input');
  });
