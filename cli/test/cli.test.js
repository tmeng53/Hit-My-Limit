import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { claudeHits, readClaude } from '../src/claude.js';
import { codexHits, readCodex } from '../src/codex.js';
import { buildReport } from '../src/report.js';
import { parseReset } from '../src/time.js';

const T = (s) => new Date(s).toISOString();
const lines = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
const since = Date.parse('2026-10-01T00:00:00Z');

function assistant(time, id, usage, extra = {}) {
  return {
    type: 'assistant', timestamp: T(time), requestId: `req_${id}`, version: '2.1.160',
    message: { id: `msg_${id}`, model: 'claude-opus-4-5', role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage },
    ...extra,
  };
}
function notice(time, text) {
  return {
    type: 'assistant', timestamp: T(time), isApiErrorMessage: true, version: '2.1.160',
    message: { id: 'x', model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text }] },
  };
}

test('parseReset reads the formats Claude Code prints', () => {
  const hit = new Date('2026-10-16T12:35:00Z');
  assert.equal(parseReset('Claude AI usage limit reached|1792195200', hit).toISOString(), '2026-10-17T00:00:00.000Z');
  assert.equal(parseReset("You've hit your limit · resets 3pm (UTC)", hit).toISOString(), '2026-10-16T15:00:00.000Z');
  assert.equal(parseReset('5-hour limit reached ∙ resets 2:30am (UTC)', hit).toISOString(), '2026-10-17T02:30:00.000Z');
  assert.equal(parseReset('Weekly limit reached ∙ resets Oct 20, 9am (America/New_York)', hit).toISOString(), '2026-10-20T13:00:00.000Z');
  assert.equal(parseReset('resets 3pm (Europe/Berlin)', hit).toISOString(), '2026-10-16T13:00:00.000Z');
  assert.equal(parseReset('limit reached, try later', hit), null);
});

test('Claude Code: finds a 5-hour hit, its window and the tokens used in it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hml-claude-'));
  mkdirSync(join(dir, 'proj', 'sess', 'subagents'), { recursive: true });
  const u = { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10000 };
  writeFileSync(join(dir, 'proj', 'a.jsonl'), lines([
    assistant('2026-10-16T09:10:00Z', 1, u),
    assistant('2026-10-16T09:10:01Z', 1, u), // same message, second content block: counted once
    assistant('2026-10-16T10:00:00Z', 2, u),
    notice('2026-10-16T11:45:00Z', "You've hit your limit · resets 2pm (UTC)"),
    notice('2026-10-16T11:50:00Z', "You've hit your limit · resets 2pm (UTC)"),
    assistant('2026-10-16T20:00:00Z', 4, u), // a later window, no hit
  ]) + 'not json\n');
  writeFileSync(join(dir, 'proj', 'sess', 'subagents', 'agent-1.jsonl'), lines([assistant('2026-10-16T11:00:00Z', 3, u)]));

  const hits = claudeHits(await readClaude([dir], since));
  assert.equal(hits.length, 1);
  const [h] = hits;
  assert.equal(h.window, '5h');
  assert.equal(new Date(h.start).toISOString(), '2026-10-16T09:00:00.000Z');
  assert.equal(h.model, 'opus');
  assert.deepEqual(h.tokens, { input: 30, output: 300, cache_read: 30000, cache_write: 3000, total: 33330 });

  const r = buildReport(h, { plan: 'max-5x', work: 'coding', account: 'own', clientId: 'a'.repeat(32) });
  assert.equal(r.minutes_to_limit, 165);
  assert.equal(r.hit_on, '2026-10-16');
  assert.equal(r.tool_version, '2.1.160');
  assert.deepEqual(Object.keys(r).sort(), ['account', 'client_id', 'felt', 'hit_on', 'lab', 'minutes_to_limit', 'model', 'plan', 'product', 'source', 'tokens', 'tool_version', 'window', 'work']);
});

test('Claude Code: without a reset time, uses the 5-hour window the hit falls in', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hml-claude-'));
  const u = { input_tokens: 1, output_tokens: 1 };
  writeFileSync(join(dir, 'a.jsonl'), lines([
    assistant('2026-10-16T09:40:00Z', 1, u),
    notice('2026-10-16T12:00:00Z', 'Claude usage limit reached.'),
  ]));
  const [h] = claudeHits(await readClaude([dir], since));
  assert.equal(new Date(h.start).toISOString(), '2026-10-16T09:00:00.000Z');
});

test('Claude Code: ignores ordinary text that mentions a limit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hml-claude-'));
  const row = assistant('2026-10-16T09:40:00Z', 1, { input_tokens: 1, output_tokens: 1 });
  row.message.content = [{ type: 'text', text: 'The rate limit reached its cap in the test.' }];
  writeFileSync(join(dir, 'a.jsonl'), lines([row]));
  assert.equal(claudeHits(await readClaude([dir], since)).length, 0);
});

test('Codex: finds a weekly hit from rate-limit snapshots and sums token increases', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hml-codex-'));
  mkdirSync(join(dir, '2026', '10', '16'), { recursive: true });
  const resetsAt = Date.parse('2026-10-20T00:00:00Z') / 1000;
  const tc = (time, total, used) => ({
    timestamp: T(time), type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: total, cached_input_tokens: total / 2, output_tokens: total / 10, total_tokens: total * 1.1 } },
      rate_limits: {
        plan_type: 'plus',
        primary: { used_percent: 40, window_minutes: 300, resets_at: resetsAt - 3 * 86400 },
        secondary: { used_percent: used, window_minutes: 10080, resets_at: resetsAt },
      },
    },
  });
  writeFileSync(join(dir, '2026', '10', '16', 'rollout-1.jsonl'), lines([
    { timestamp: T('2026-10-16T08:00:00Z'), type: 'session_meta', payload: { cli_version: '0.80.0' } },
    { timestamp: T('2026-10-16T08:00:00Z'), type: 'turn_context', payload: { model: 'GPT-5-Codex' } },
    tc('2026-10-16T08:10:00Z', 1000, 90),
    tc('2026-10-16T08:10:01Z', 1000, 90), // repeated totals add nothing
    tc('2026-10-16T09:00:00Z', 3000, 100),
    tc('2026-10-16T09:05:00Z', 3000, 100),
  ]));
  const hits = codexHits(await readCodex([dir], since));
  assert.equal(hits.length, 1);
  const [h] = hits;
  assert.equal(h.window, 'weekly');
  assert.equal(h.plan, 'plus');
  assert.equal(h.model, 'gpt-5-codex');
  assert.equal(h.tool_version, '0.80.0');
  assert.equal(new Date(h.start).toISOString(), '2026-10-13T00:00:00.000Z');
  assert.deepEqual(h.tokens, { input: 1500, output: 300, cache_read: 1500, cache_write: 0, total: 3300 });
  const r = buildReport(h, { plan: 'plus', work: 'coding', account: 'own', clientId: 'a'.repeat(32) });
  assert.equal(r.minutes_to_limit, 3 * 1440 + 9 * 60);
});

test('Codex: finds a hit recorded as a refused turn after the last snapshot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hml-codex-'));
  const resetsAt = Date.parse('2026-10-04T05:00:00Z') / 1000;
  const snap = (time, primary) => ({
    timestamp: T(time), type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 500, cached_input_tokens: 0, output_tokens: 50 } },
      rate_limits: primary
        ? { plan_type: 'plus', primary: { used_percent: 98.0, window_minutes: 300, resets_at: resetsAt }, secondary: { used_percent: 15.0, window_minutes: 10080, resets_at: resetsAt + 6 * 86400 } }
        : { plan_type: null, primary: null, secondary: null },
    },
  });
  writeFileSync(join(dir, 'rollout-2.jsonl'), lines([
    snap('2026-10-04T02:59:49Z', true),
    snap('2026-10-04T02:59:50Z', false),
    { timestamp: T('2026-10-04T02:59:50Z'), type: 'event_msg', payload: { type: 'task_complete', error: { message: "You've hit your usage limit. Upgrade to Pro" } } },
    { timestamp: T('2026-10-04T03:00:01Z'), type: 'event_msg', payload: { type: 'task_complete', error: { message: "You've hit your usage limit. Upgrade to Pro" } } },
  ]));
  const hits = codexHits(await readCodex([dir], since));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].window, '5h');
  assert.equal(hits[0].plan, 'plus');
  assert.equal(new Date(hits[0].start).toISOString(), '2026-10-04T00:00:00.000Z');
});

test('Claude Code: reads "session limit" notices and the 12:20am reset format', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hml-claude-'));
  writeFileSync(join(dir, 'a.jsonl'), lines([
    assistant('2026-10-15T23:00:00Z', 1, { input_tokens: 1, output_tokens: 1 }),
    notice('2026-10-16T02:05:00Z', "You've hit your session limit · resets 12:20am (America/New_York)"),
  ]));
  const [h] = claudeHits(await readClaude([dir], since));
  assert.equal(h.window, '5h');
  assert.equal(new Date(h.start).toISOString(), '2026-10-15T23:20:00.000Z');
  assert.equal(buildReport(h, { plan: 'pro', work: 'coding', account: 'own', clientId: 'a'.repeat(32) }).minutes_to_limit, 165);
});
