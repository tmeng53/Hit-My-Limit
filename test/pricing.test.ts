import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiValue, priceFor } from '../src/lib/pricing.ts';

const none = { tokens_input: null, tokens_output: null, tokens_cache_read: null, tokens_cache_write: null };

test('prices each model in the breakdown at its own rates', () => {
  const usd = apiValue({
    lab: 'anthropic', model: 'opus', ...none,
    models: {
      opus: { input: 1_000_000, output: 1_000_000, cache_read: 10_000_000, cache_write: 1_000_000 },
      haiku: { output: 1_000_000 },
    },
  });
  // opus 4 + 20 + 10 × 0.2 + 5 = 31, haiku 0.5
  assert.equal(usd, 31.5);
});

test('falls back to totals priced as the main model', () => {
  const usd = apiValue({ lab: 'openai', model: 'gpt-6.1-sol', models: null, ...none, tokens_input: 2_000_000, tokens_output: 1_000_000, tokens_cache_read: 4_000_000 });
  assert.equal(usd, 2 * 2 + 10 + 4 * 0.1);
});

test('returns null without tokens or for labs without prices', () => {
  assert.equal(apiValue({ lab: 'anthropic', model: 'opus', models: null, ...none }), null);
  assert.equal(apiValue({ lab: 'google', model: null, models: null, ...none, tokens_input: 5, tokens_output: 5 }), null);
  assert.equal(priceFor('google', null), null);
});

test('matches model names to the right price', () => {
  assert.deepEqual(priceFor('anthropic', 'claude-next'), priceFor('anthropic', 'sonnet'));
  assert.equal(priceFor('openai', 'gpt-6-astra')!.output, 50);
  assert.equal(priceFor('openai', 'gpt-6-luna')!.output, 0.5);
  assert.equal(priceFor('openai', 'gpt-5.6-sol')!.output, 20);
  assert.equal(priceFor('openai', 'gpt-5.3-codex')!.output, 14);
  assert.equal(priceFor('openai', 'gpt-6-sol')!.output, 10);
});
