import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReport } from '../src/lib/reports.ts';

const today = new Date('2026-10-17T12:00:00Z');
const base = {
  lab: 'anthropic', product: 'claude-code', plan: 'max-5x', window: '5h', minutes_to_limit: 153,
  hit_on: '2026-10-16', work: 'coding', client_id: 'abcdefabcdefabcdef12',
};

test('accepts a valid report, rounds minutes to 5 and defaults the account to own', () => {
  const r = parseReport({ ...base, model: ' Opus ', tokens: { total: 4200000 } }, today);
  assert.equal(r.minutes_to_limit, 155);
  assert.equal(r.account, 'own');
  assert.equal(r.model, 'opus');
  assert.equal(r.tokens_total, 4200000);
  assert.equal(r.source, 'form');
});

test('rejects bad values', () => {
  const bad = [
    { lab: 'meta' },
    { plan: 'plus' }, // an OpenAI plan on Anthropic
    { window: 'yearly' },
    { minutes_to_limit: 301 },
    { minutes_to_limit: 0 },
    { hit_on: '2026-01-01' },
    { work: 'gaming' },
    { account: 'stolen' },
    { client_id: 'short' },
    { tokens: { total: -1 } },
    { model: '<script>' },
  ];
  for (const b of bad) assert.throws(() => parseReport({ ...base, ...b }, today), undefined, JSON.stringify(b));
});

test('weekly windows allow up to 7 days', () => {
  assert.equal(parseReport({ ...base, window: 'weekly', minutes_to_limit: 10080 }, today).minutes_to_limit, 10080);
});

test('monthly windows allow up to 31 days', () => {
  assert.equal(parseReport({ ...base, window: 'monthly', minutes_to_limit: 44640 }, today).minutes_to_limit, 44640);
  assert.throws(() => parseReport({ ...base, window: 'monthly', minutes_to_limit: 44641 }, today));
});

test('felt is optional and limited to sooner, usual or later', () => {
  assert.equal(parseReport(base, today).felt, null);
  assert.equal(parseReport({ ...base, felt: 'sooner' }, today).felt, 'sooner');
  assert.throws(() => parseReport({ ...base, felt: 'angry' }, today));
});

test('models is an optional per-model token breakdown', () => {
  const r = parseReport({ ...base, models: { Opus: { total: 100, output: 10 }, sonnet: { total: 50, output: 5 } } }, today);
  assert.deepEqual(r.models, { opus: { total: 100, output: 10 }, sonnet: { total: 50, output: 5 } });
  assert.throws(() => parseReport({ ...base, models: { '<x>': { total: 1 } } }, today));
  assert.throws(() => parseReport({ ...base, models: [1] }, today));
});
