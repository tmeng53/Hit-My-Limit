// Reads Claude Code's local session logs (~/.claude/projects/**/*.jsonl). Only token counts, model names,
// timestamps and the text of Claude Code's own "limit reached" notices are used.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { eachLine, jsonlFiles } from './files.js';
import { HOUR, DAY, parseReset } from './time.js';

// e.g. "5-hour limit reached ∙ resets 3pm", "You've hit your session limit · resets 12:20am (America/New_York)"
const LIMIT = /limit reached|hit your (?:[a-z-]+ )?limit|limit will reset/i;

export function claudeDirs(env = process.env) {
  const roots = env.CLAUDE_CONFIG_DIR
    ? env.CLAUDE_CONFIG_DIR.split(',').map((s) => s.trim()).filter(Boolean)
    : [join(homedir(), '.config', 'claude'), join(homedir(), '.claude')];
  return roots.map((r) => join(r, 'projects'));
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join(' ');
  return '';
}

export async function readClaude(dirs, since) {
  const usage = [];
  const hits = [];
  const seen = new Set();
  for (const dir of dirs) {
    for (const file of await jsonlFiles(dir, since)) {
      await eachLine(file, '"assistant"', (e) => {
        if (e.type !== 'assistant' || !e.message) return;
        const time = Date.parse(e.timestamp);
        if (!(time >= since)) return;
        const msg = e.message;
        if (msg.model === '<synthetic>' || e.isApiErrorMessage) {
          const text = textOf(msg.content);
          if (LIMIT.test(text)) hits.push({ time, text: text.slice(0, 300), version: e.version ?? null });
          return;
        }
        const u = msg.usage;
        if (!u) return;
        // Claude Code writes one line per content block, each repeating the message's usage.
        const key = `${msg.id}:${e.requestId}`;
        if (msg.id && seen.has(key)) return;
        seen.add(key);
        usage.push({
          time,
          model: msg.model ?? null,
          version: e.version ?? null,
          input: u.input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          cacheWrite: u.cache_creation_input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
        });
      });
    }
  }
  usage.sort((a, b) => a.time - b.time);
  hits.sort((a, b) => a.time - b.time);
  return { usage, hits };
}

// 5-hour windows as Claude Code counts them: a window opens at the hour of the first message sent after the
// previous window ended. Chat use in the Claude app also opens windows, which these logs can't see.
export function fiveHourWindows(usage) {
  const windows = [];
  let start = null;
  for (const u of usage) {
    if (start === null || u.time >= start + 5 * HOUR) {
      start = Math.floor(u.time / HOUR) * HOUR;
      windows.push(start);
    }
  }
  return windows;
}

export function modelFamily(model) {
  const m = String(model ?? '').toLowerCase();
  for (const f of ['opus', 'sonnet', 'haiku']) if (m.includes(f)) return f;
  return m ? m.slice(0, 40) : null;
}

// Turns limit notices into report candidates. Hits whose window start can't be worked out are left out.
export function claudeHits({ usage, hits }) {
  const windows = fiveHourWindows(usage);
  const out = [];
  for (const h of hits) {
    const kind = /week/i.test(h.text) ? 'weekly' : '5h';
    const length = kind === 'weekly' ? 7 * DAY : 5 * HOUR;
    const reset = parseReset(h.text, new Date(h.time));
    let start = null;
    if (reset && reset.getTime() > h.time && reset.getTime() - h.time <= length) {
      start = reset.getTime() - length;
    } else if (kind === '5h') {
      start = windows.filter((w) => w <= h.time && h.time < w + length).pop() ?? null;
    }
    if (start === null) continue;
    // Retrying after the limit writes the same notice again; keep the first one per window.
    if (out.some((o) => o.window === kind && Math.abs(o.start - start) < 30 * 60_000)) continue;
    out.push({ lab: 'anthropic', product: 'claude-code', window: kind, start, hit: h.time, version: h.version });
  }
  return out.map((c) => withTokens(c, usage));
}

function withTokens(c, usage) {
  const inWindow = usage.filter((u) => u.time >= c.start && u.time <= c.hit);
  const sum = (k) => inWindow.reduce((n, u) => n + u[k], 0);
  const byModel = {};
  for (const u of inWindow) {
    const f = modelFamily(u.model);
    if (f) byModel[f] = (byModel[f] ?? 0) + u.output;
  }
  const model = Object.entries(byModel).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const tokens = { input: sum('input'), output: sum('output'), cache_read: sum('cacheRead'), cache_write: sum('cacheWrite') };
  tokens.total = tokens.input + tokens.output + tokens.cache_read + tokens.cache_write;
  return {
    ...c,
    model,
    tokens: inWindow.length ? tokens : null,
    tool_version: c.version ?? inWindow.at(-1)?.version ?? null,
    plan: null,
  };
}
