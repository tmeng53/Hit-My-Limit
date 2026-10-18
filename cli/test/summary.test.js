import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hookSummary, modelMix, ownHistory, unusual } from '../src/summary.js';

const hit = (day, mins, extra = {}) => {
  const start = new Date(2026, 9, day, 9).getTime();
  return { lab: 'anthropic', window: '5h', start, hit: start + mins * 60_000, ...extra };
};

test('modelMix shows the biggest models first, in percent', () => {
  assert.equal(modelMix({ sonnet: { total: 22 }, opus: { total: 78 } }), 'Opus 78% · Sonnet 22%');
  assert.equal(modelMix({ opus: { total: 5 } }), 'All Opus');
  assert.equal(modelMix(null), '');
});

test('ownHistory compares with earlier hits of the same limit this week', () => {
  const now = hit(18, 180); // Sun Oct 18
  assert.equal(ownHistory(now, [now]), 'First time this week');
  assert.equal(ownHistory(now, [hit(13, 220), now]), '2nd time this week, 40m sooner than Tue');
  assert.equal(ownHistory(now, [hit(13, 220), hit(15, 150), now]), '3rd time this week, 30m later than Thu');
  assert.equal(ownHistory(now, [hit(16, 185), now]), '2nd time this week, about the same as Fri');
  assert.equal(ownHistory(now, [hit(9, 100), now]), 'First time this week', 'older than a week is ignored');
});

test('hookSummary uses the comparison once there is one, else the own history', () => {
  const now = hit(18, 195, { models: { opus: { total: 78 }, sonnet: { total: 22 } } });
  const s = hookSummary(now, 'pro', { percent: 62, n: 40 }, [now]);
  assert.deepEqual(s, { title: 'Claude Pro: 5-hour limit out after 3h 15m', line: 'Sooner than 62% of Pro reports', models: 'Opus 78% · Sonnet 22%' });
  assert.equal(hookSummary(now, 'pro', { percent: null, n: 3 }, [now]).line, 'First time this week');
});

test('unusual flags a hit far off the usual for that limit, a hint the plan changed', () => {
  const t = (n) => ({ tokens: { total: n } });
  const past = [hit(10, 180, t(4e6)), hit(11, 200, t(5e6)), hit(12, 190, t(4.5e6))];
  const big = hit(14, 300, t(11e6));
  const small = hit(14, 60, t(1.5e6));
  const usual = hit(14, 190, t(5e6));
  assert.equal(unusual(big, [...past, big]), 'more');
  assert.equal(unusual(small, [...past, small]), 'less');
  assert.equal(unusual(usual, [...past, usual]), null);
  // Too little history to tell.
  assert.equal(unusual(big, [past[0], big]), null);
  // Without tokens, time to the limit is used.
  assert.equal(unusual(hit(14, 400), [hit(10, 180), hit(11, 190), hit(14, 400)]), 'more');
});
