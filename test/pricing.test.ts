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
  const usd = apiValue({ lab: 'openai', model: 'gpt-5.1-codex', models: null, ...none, tokens_input: 2_000_000, tokens_output: 1_000_000, tokens_cache_read: 4_000_000 });
  assert.equal(usd, 2 * 1.25 + 10 + 4 * 0.125);
});

test('returns null without tokens or for labs without prices', () => {
  assert.equal(apiValue({ lab: 'anthropic', model: 'opus', models: null, ...none }), null);
  assert.equal(apiValue({ lab: 'google', model: null, models: null, ...none, tokens_input: 5, tokens_output: 5 }), null);
  assert.equal(priceFor('google', null), null);
});

test('unknown Claude models use the Sonnet price, mini Codex models the cheaper one', () => {
  assert.deepEqual(priceFor('anthropic', 'claude-next'), priceFor('anthropic', 'sonnet'));
  assert.notDeepEqual(priceFor('openai', 'gpt-5-codex-mini'), priceFor('openai', 'gpt-5-codex'));
});
