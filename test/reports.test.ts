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
    { window: 'monthly' },
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
