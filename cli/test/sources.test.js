import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manualHit, parsePast, parseWhen } from '../src/manual.js';
import { claudePlan, claudeWindows, codexPlan, codexWindows, usageHits } from '../src/usage.js';

// Local times, so the tests pass in any time zone.
const now = new Date(2026, 9, 16, 14, 0); // Fri Oct 16, 2pm

test('parseWhen reads relative, clock and weekday times', () => {
  assert.equal(parseWhen('in 2h 10m', now).getTime(), now.getTime() + 130 * 60_000);
  assert.equal(parseWhen('in 45 min', now).getTime(), now.getTime() + 45 * 60_000);
  const at = parseWhen('5pm', now);
  assert.equal(at.getHours(), 17);
  assert.equal(at.getDate(), 16);
  const thu = parseWhen('Thu 9am', now);
  assert.equal(thu.getDay(), 4);
  assert.equal(thu.getHours(), 9);
  assert.ok(thu > now);
  assert.equal(parseWhen('whenever', now), null);
});

test('parsePast reads "ago" and earlier clock times', () => {
  assert.equal(parsePast('40m ago', now).getTime(), now.getTime() - 40 * 60_000);
  assert.equal(parsePast('1h ago', now).getTime(), now.getTime() - 60 * 60_000);
  const t = parsePast('1:30pm', now);
  assert.equal(t.getHours(), 13);
  assert.equal(t.getDate(), 16);
});

test('manualHit works out the window start and rejects impossible times', () => {
  const resets = new Date(now.getTime() + 2 * 3600_000);
  const h = manualHit({ product: 'claude-app', lab: 'anthropic', window: '5h', plan: 'pro', hit: now, resets });
  assert.equal(h.start, resets.getTime() - 5 * 3600_000);
  assert.equal(h.tokens, null);
  assert.equal(h.source, 'manual');
  assert.equal(manualHit({ product: 'chatgpt', lab: 'openai', window: '5h', plan: 'plus', hit: now, resets: new Date(now.getTime() + 6 * 3600_000) }), null);
});

test('plans are mapped from the saved logins', () => {
  assert.equal(claudePlan('max', 'default_claude_max_20x'), 'max-20x');
  assert.equal(claudePlan('max', 'default_claude_max_5x'), 'max-5x');
  assert.equal(claudePlan('pro', ''), 'pro');
  assert.equal(claudePlan('max', ''), null);
  assert.equal(codexPlan('plus'), 'plus');
  assert.equal(codexPlan('team'), 'business');
  assert.equal(codexPlan('pro'), null);
});

test('claudeWindows and codexWindows read the usage replies', () => {
  const c = claudeWindows({
    five_hour: { utilization: 100, resets_at: '2026-10-16T15:00:00Z' },
    seven_day: { utilization: 41.6, resets_at: '2026-10-20T09:00:00Z' },
  });
  assert.deepEqual(c.map((w) => [w.window, w.used]), [['5h', 100], ['weekly', 42]]);
  assert.equal(c[0].start.toISOString(), '2026-10-16T10:00:00.000Z');

  const reset = Date.parse('2026-10-16T15:00:00Z') / 1000;
  const x = codexWindows({ rate_limit: {
    limit_reached: true,
    primary_window: { used_percent: 97, limit_window_seconds: 18000, reset_at: reset },
    secondary_window: { used_percent: 30, limit_window_seconds: 604800, reset_at: reset + 86400 },
  } });
  assert.deepEqual(x.map((w) => [w.window, w.used]), [['5h', 100], ['weekly', 30]]);
  assert.deepEqual(codexWindows({}), []);
});

test('usageHits turns only full windows into hits', () => {
  const resets = new Date(now.getTime() + 3600_000);
  const hits = usageHits({ lab: 'anthropic', product: 'claude-code', plan: 'pro', windows: [
    { window: '5h', used: 100, resets, start: new Date(resets.getTime() - 5 * 3600_000) },
    { window: 'weekly', used: 80, resets, start: now },
  ] }, now.getTime());
  assert.equal(hits.length, 1);
  assert.equal(hits[0].hit, now.getTime());
  assert.equal(hits[0].source, 'login');
});
