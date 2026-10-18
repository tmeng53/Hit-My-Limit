import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manualHit, parsePast, parseWhen } from '../src/manual.js';

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
