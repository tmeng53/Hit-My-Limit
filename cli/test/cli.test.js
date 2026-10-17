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
  assert.deepEqual(h.models, { opus: { total: 33330, input: 30, output: 300, cache_read: 30000, cache_write: 3000 } });
  assert.equal(h.requests, 3);
  assert.equal(h.start_hour, 9);
  assert.deepEqual(h.tokens, { input: 30, output: 300, cache_read: 30000, cache_write: 3000, total: 33330 });

  const r = buildReport(h, { plan: 'max-5x', work: 'coding', account: 'own', clientId: 'a'.repeat(32) });
  assert.equal(r.minutes_to_limit, 165);
  assert.equal(r.hit_on, '2026-10-16');
  assert.equal(r.tool_version, '2.1.160');
  assert.deepEqual(Object.keys(r).sort(), ['account', 'client_id', 'felt', 'hit_on', 'lab', 'minutes_to_limit', 'model', 'models', 'plan', 'product', 'requests', 'source', 'start_hour', 'tokens', 'tool_version', 'weekly_used', 'window', 'work']);
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
      info: { total_token_usage: { input_tokens: total, cached_input_tokens: total / 2, output_tokens: total / 10, reasoning_output_tokens: total / 20, total_tokens: total * 1.1 } },
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
  assert.deepEqual(h.tokens, { input: 1500, output: 300, cache_read: 1500, cache_write: 0, total: 3300, reasoning: 150 });
  assert.equal(h.models['gpt-5-codex'].reasoning, 150);
  assert.equal(h.requests, 2);
  assert.equal(h.weekly_used, null); // only reported for 5-hour hits
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
  assert.equal(hits[0].weekly_used, 15);
  assert.equal(hits[0].start_hour, 0);
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

test('hit list shows tokens, cache share, models, plan and weekly use', async () => {
  const { hitLines } = await import('../src/display.js');
  const c = {
    lab: 'openai', product: 'codex', window: '5h', plan: 'plus', weekly_used: 40,
    start: Date.parse('2026-10-16T09:00:00Z'), hit: Date.parse('2026-10-16T11:15:00Z'), requests: 12,
    tokens: { total: 2_000_000, cache_read: 1_500_000 },
    models: { 'gpt-5-codex': { total: 1_500_000 }, 'gpt-5-mini': { total: 500_000 } },
  };
  const text = hitLines(c, 0).join('\n');
  assert.match(text, /Codex, 5-hour limit {2}new/);
  assert.match(text, /Ran out 2h 15m after the window started \(09:00 UTC\)/);
  assert.match(text, /2\.0M tokens, 12 requests, 75% read from cache/);
  assert.match(text, /gpt-5-codex +1\.5M +75%/);
  assert.match(text, /plan Plus \(from the logs\), weekly limit 40% used/);
});

test('limit notices that cannot be read are counted, rate-limit errors are not', async () => {
  const { unreadNote } = await import('../src/display.js');
  const dir = mkdtempSync(join(tmpdir(), 'hml-claude-'));
  writeFileSync(join(dir, 'a.jsonl'), lines([
    notice('2026-10-16T09:00:00Z', 'API Error: Rate limit reached for requests'),
    notice('2026-10-16T10:00:00Z', 'Your plan allowance hit its limit; back at 3pm'),
    notice('2026-10-16T10:05:00Z', 'Your plan allowance hit its limit; back at 3pm'),
  ]));
  const data = await readClaude([dir], since);
  assert.equal(claudeHits(data).length, 0);
  assert.equal(data.unread.length, 2);
  const note = unreadNote([['Claude Code', data.unread], ['Codex', []]]);
  assert.match(note, /couldn't be read \(1 in Claude Code\)/);
  assert.match(note, /issues\/new\?title=/);
  assert.equal(unreadNote([['Codex', []]]), null);
});

test('status: open Claude window next to earlier hits, Codex windows, and a drop in tokens before the limit', async () => {
  const { status } = await import('../src/status.js');
  const now = Date.parse('2026-10-17T10:30:00Z');
  const cdir = mkdtempSync(join(tmpdir(), 'hml-claude-'));
  const u = (n) => ({ input_tokens: 0, output_tokens: n, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
  writeFileSync(join(cdir, 'a.jsonl'), lines([
    // Two earlier hits at 4M tokens, one this week at 2M.
    assistant('2026-10-02T09:10:00Z', 1, u(4_000_000)),
    notice('2026-10-02T11:00:00Z', "You've hit your limit · resets 2pm (UTC)"),
    assistant('2026-10-05T09:10:00Z', 2, u(4_000_000)),
    notice('2026-10-05T11:00:00Z', "You've hit your limit · resets 2pm (UTC)"),
    assistant('2026-10-15T09:10:00Z', 3, u(2_000_000)),
    notice('2026-10-15T11:00:00Z', "You've hit your limit · resets 2pm (UTC)"),
    // The open window.
    assistant('2026-10-17T09:20:00Z', 4, u(1_000_000)),
    assistant('2026-10-17T10:00:00Z', 5, u(500_000)),
  ]));
  const xdir = mkdtempSync(join(tmpdir(), 'hml-codex-'));
  const reset5h = Date.parse('2026-10-17T12:00:00Z') / 1000;
  const old5h = Date.parse('2026-10-17T08:00:00Z') / 1000;
  const tc = (time, primaryReset, used) => ({
    timestamp: T(time), type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 1 } },
      rate_limits: {
        plan_type: 'plus',
        primary: { used_percent: used, window_minutes: 300, resets_at: primaryReset },
        secondary: { used_percent: 30.4, window_minutes: 10080, resets_at: reset5h + 3 * 86400 },
      },
    },
  });
  writeFileSync(join(xdir, 'rollout-new.jsonl'), lines([tc('2026-10-17T09:00:00Z', reset5h, 42.6)]));
  writeFileSync(join(xdir, 'rollout-old.jsonl'), lines([tc('2026-10-17T05:00:00Z', old5h, 90)]));

  const claude = await readClaude([cdir], since);
  const codex = await readCodex([xdir], since);
  const s = status({ claude, codex, claudeFound: claudeHits(claude), codexFound: codexHits(codex), state: { sent: [], plans: {} }, now });

  assert.equal(new Date(s.claude.window.start).toISOString(), '2026-10-17T09:00:00.000Z');
  assert.equal(new Date(s.claude.window.resets_at).toISOString(), '2026-10-17T14:00:00.000Z');
  assert.equal(s.claude.window.tokens, 1_500_000);
  assert.equal(s.claude.window.typical_at_limit, 4_000_000);
  assert.equal(s.claude.limited_until, null);
  assert.deepEqual(s.codex.limits, [
    { window: '5h', used: 43, resets_at: reset5h * 1000 },
    { window: 'weekly', used: 30, resets_at: (reset5h + 3 * 86400) * 1000 },
  ]);
  assert.equal(s.codex.plan, 'plus');
  assert.equal(s.hits.length, 3);
  assert.match(s.hits[0].key, /^anthropic:5h:2026-10-15T09:00/);
  // The same per-model tokens the report would send.
  assert.equal(Object.values(s.hits[0].models).reduce((n, m) => n + m.total, 0), s.hits[0].tokens);
  assert.ok(s.hits[0].requests > 0);
  assert.deepEqual(s.trend, [{
    lab: 'anthropic', window: '5h',
    recent: { n: 1, tokens: 2_000_000, minutes: 120 },
    earlier: { n: 2, tokens: 4_000_000, minutes: 120 },
  }]);
});

test('status: a window whose reset has passed shows as empty', async () => {
  const { codexNow } = await import('../src/status.js');
  const now = Date.parse('2026-10-17T10:00:00Z');
  const s = codexNow({ latest: { time: now - 3 * 3600_000, plan: null, snap: [{ used: 100, minutes: 300, resetsAt: now - 60_000 }] } }, now);
  assert.deepEqual(s.limits, [{ window: '5h', used: 0, resets_at: null }]);
});

test('Codex: usage before the period sets the baseline but is not counted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hml-codex-'));
  const tc = (time, input) => ({
    timestamp: T(time), type: 'event_msg',
    payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: 0 } } },
  });
  writeFileSync(join(dir, 'rollout-3.jsonl'), lines([
    tc('2026-09-01T10:00:00Z', 10_000), // before `since`
    tc('2026-10-16T10:00:00Z', 10_100),
  ]));
  const { usage } = await readCodex([dir], since);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].input, 100);
});

test('without a terminal, nothing is sent unless --yes is given', async () => {
  const { createServer } = await import('node:http');
  const { execFile } = await import('node:child_process');
  let received = 0;
  const server = createServer((req, res) => {
    received++;
    req.resume();
    req.on('end', () => res.end('{"saved":true,"comparison":null}'));
  });
  await new Promise((r) => server.listen(0, r));
  const home = mkdtempSync(join(tmpdir(), 'hml-home-'));
  mkdirSync(join(home, '.codex', 'sessions'), { recursive: true });
  const now = Date.now();
  const at = (ago) => new Date(now - ago * 60_000).toISOString();
  writeFileSync(join(home, '.codex', 'sessions', 'rollout-4.jsonl'), lines([
    { timestamp: at(60), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 10 } },
      rate_limits: { plan_type: 'plus', primary: { used_percent: 100, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600 } } } },
  ]));
  const run = (args) => new Promise((resolve) => {
    execFile(process.execPath, [new URL('../bin/hitmylimit.js', import.meta.url).pathname, ...args], {
      env: { ...process.env, HOME: home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: '', HITMYLIMIT_API: `http://localhost:${server.address().port}/api/reports` },
    }, (err, stdout) => resolve({ err, stdout }));
  });
  try {
    const a = await run([]);
    assert.equal(a.err, null);
    assert.match(a.stdout, /Nothing was sent\. Run with --yes/);
    assert.equal(received, 0);
    await run(['--yes']);
    assert.equal(received, 1);
  } finally {
    server.close();
  }
});
