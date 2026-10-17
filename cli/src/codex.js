// Reads Codex's local session logs (~/.codex/sessions/**/*.jsonl). Only token counts, rate-limit snapshots,
// model names and timestamps are used.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { eachLine, jsonlFiles } from './files.js';

export function codexDirs(env = process.env) {
  const root = env.CODEX_HOME || join(homedir(), '.codex');
  return [join(root, 'sessions'), join(root, 'archived_sessions')];
}

function windowKind(minutes) {
  if (minutes >= 240 && minutes <= 360) return '5h';
  if (minutes >= 1300 && minutes <= 1600) return 'daily';
  if (minutes >= 9000 && minutes <= 11000) return 'weekly';
  return null;
}

// Codex's plan names mapped to the site's. "pro" covers several Pro tiers, so the user is asked.
const PLANS = { free: 'free', go: 'go', plus: 'plus', business: 'business', team: 'business', enterprise: 'enterprise', edu: 'enterprise' };

function snapshot(rl, time) {
  const out = [];
  for (const key of ['primary', 'secondary']) {
    const w = rl?.[key];
    if (!w || typeof w.used_percent !== 'number' || typeof w.window_minutes !== 'number') continue;
    const resetsAt = typeof w.resets_at === 'number'
      ? w.resets_at * 1000
      : typeof w.resets_in_seconds === 'number' ? time + w.resets_in_seconds * 1000 : null;
    out.push({ used: w.used_percent, minutes: w.window_minutes, resetsAt });
  }
  return out;
}

export async function readCodex(dirs, since) {
  const usage = [];
  const hits = [];
  for (const dir of dirs) {
    for (const file of await jsonlFiles(dir, since)) {
      let version = null;
      let model = null;
      let prev = null;
      let last = [];
      let plan = null;
      await eachLine(file, '"type"', (e) => {
        const p = e.payload;
        if (!p) return;
        const time = Date.parse(e.timestamp);
        if (e.type === 'session_meta') version = p.cli_version ?? version;
        if (e.type === 'turn_context') model = p.model ?? model;
        if (e.type !== 'event_msg' || !(time >= since)) return;

        if (p.type === 'token_count') {
          const t = p.info?.total_token_usage;
          if (t) {
            // Totals are cumulative per session; count only the increase since the previous event.
            const cur = { input: t.input_tokens ?? 0, cached: t.cached_input_tokens ?? 0, output: t.output_tokens ?? 0 };
            const grew = prev && cur.input >= prev.input && cur.output >= prev.output && cur.cached >= prev.cached;
            const d = grew ? { input: cur.input - prev.input, cached: cur.cached - prev.cached, output: cur.output - prev.output } : cur;
            prev = cur;
            if (d.input || d.output) {
              usage.push({ time, model, version, input: d.input - d.cached, cacheRead: d.cached, output: d.output });
            }
          }
          if (p.rate_limits) {
            last = snapshot(p.rate_limits, time);
            plan = PLANS[String(p.rate_limits.plan_type ?? '').toLowerCase()] ?? plan;
            for (const w of last) if (w.used >= 100) hits.push({ time, ...w, plan, version });
          }
        } else if (p.type === 'error' && /usage limit/i.test(String(p.message ?? ''))) {
          // The error doesn't say which limit; use the fullest window from the latest snapshot.
          const w = [...last].sort((a, b) => b.used - a.used)[0];
          if (w && w.used >= 90) hits.push({ time, ...w, plan, version });
        }
      });
    }
  }
  usage.sort((a, b) => a.time - b.time);
  hits.sort((a, b) => a.time - b.time);
  return { usage, hits };
}

export function codexHits({ usage, hits }) {
  const out = [];
  for (const h of hits) {
    const kind = windowKind(h.minutes);
    if (!kind || !h.resetsAt) continue;
    const start = h.resetsAt - h.minutes * 60_000;
    if (!(start < h.time)) continue;
    if (out.some((o) => o.window === kind && Math.abs(o.start - start) < 30 * 60_000)) continue;
    out.push({ lab: 'openai', product: 'codex', window: kind, start, hit: h.time, plan: h.plan, version: h.version });
  }
  return out.map((c) => {
    const inWindow = usage.filter((u) => u.time >= c.start && u.time <= c.hit);
    const sum = (k) => inWindow.reduce((n, u) => n + u[k], 0);
    const byModel = {};
    for (const u of inWindow) if (u.model) byModel[u.model] = (byModel[u.model] ?? 0) + u.output;
    const tokens = { input: sum('input'), output: sum('output'), cache_read: sum('cacheRead'), cache_write: 0 };
    tokens.total = tokens.input + tokens.output + tokens.cache_read;
    return {
      ...c,
      model: Object.entries(byModel).sort((a, b) => b[1] - a[1])[0]?.[0]?.toLowerCase().slice(0, 40) ?? null,
      tokens: inWindow.length ? tokens : null,
      tool_version: c.version ?? inWindow.at(-1)?.version ?? null,
    };
  });
}
