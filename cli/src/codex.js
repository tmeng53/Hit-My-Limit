// Reads Codex's local session logs (~/.codex/sessions/**/*.jsonl). Only token counts, rate-limit snapshots,
// model names and timestamps are used.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { eachLine, jsonlFiles } from './files.js';
import { windowSummary } from './models.js';

export function codexDirs(env = process.env) {
  const root = env.CODEX_HOME || join(homedir(), '.codex');
  return [join(root, 'sessions'), join(root, 'archived_sessions')];
}

function windowKind(minutes) {
  if (minutes >= 240 && minutes <= 360) return '5h';
  if (minutes >= 1300 && minutes <= 1600) return 'daily';
  if (minutes >= 9000 && minutes <= 11000) return 'weekly';
  if (minutes >= 40000 && minutes <= 44640) return 'monthly';
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
  // Limit events that couldn't be read; a sign the log format changed.
  const unread = [];
  // Every real snapshot, from all sessions, for limit errors in a session that logged none of its own.
  const snaps = [];
  const orphans = [];
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
        if (e.type !== 'event_msg') return;
        // Counters before the period still set the baseline for the cumulative totals, but count nothing.
        const early = !(time >= since);
        if (early && p.type !== 'token_count') return;

        if (p.type === 'token_count') {
          const t = p.info?.total_token_usage;
          if (t) {
            // Totals are cumulative per session; count only the increase since the previous event.
            const cur = {
              input: t.input_tokens ?? 0,
              cached: t.cached_input_tokens ?? 0,
              output: t.output_tokens ?? 0,
              reasoning: t.reasoning_output_tokens ?? 0,
            };
            const grew = prev && Object.keys(cur).every((k) => cur[k] >= prev[k]);
            const d = grew ? Object.fromEntries(Object.keys(cur).map((k) => [k, cur[k] - prev[k]])) : cur;
            prev = cur;
            if (!early && (d.input || d.output)) {
              usage.push({ time, model, version, input: d.input - d.cached, cacheRead: d.cached, output: d.output, reasoning: d.reasoning });
            }
          }
          if (p.rate_limits && !early) {
            // Once a request is refused, Codex logs snapshots with empty windows; keep the last real one.
            const snap = snapshot(p.rate_limits, time);
            if (snap.length) {
              last = snap;
              snaps.push({ time, snap, plan: PLANS[String(p.rate_limits.plan_type ?? '').toLowerCase()] ?? plan });
            }
            // Windows present but in a shape this tool doesn't know.
            else if (['primary', 'secondary'].some((k) => p.rate_limits[k])) unread.push({ time, version });
            plan = PLANS[String(p.rate_limits.plan_type ?? '').toLowerCase()] ?? plan;
            for (const w of snap) if (w.used >= 100) hits.push({ time, ...w, plan, version, snap });
          }
        } else if (/usage limit/i.test(String(p.error?.message ?? p.message ?? '')) && (p.type === 'error' || p.type === 'task_complete')) {
          // "You've hit your usage limit" doesn't say which limit; use the fullest window from the last snapshot.
          const w = [...last].sort((a, b) => b.used - a.used)[0];
          if (w && w.used >= 90) hits.push({ time, ...w, plan, version, snap: last });
          else orphans.push({ time, version });
        } else if ((p.type === 'error' || p.type === 'task_complete') && /\blimit\b/i.test(String(p.error?.message ?? p.message ?? ''))
          && !/rate limit|context|too long|output token/i.test(String(p.error?.message ?? p.message ?? ''))) {
          unread.push({ time, version });
        }
      });
    }
  }
  // A session that starts already out of quota logs the error before any snapshot. The account's limits are
  // shared across sessions, so use the latest earlier snapshot, from any session, with a window still full then.
  snaps.sort((a, b) => a.time - b.time);
  const full = (s, time) => s.snap.filter((w) => w.used >= 90 && (!w.resetsAt || w.resetsAt > time)).sort((a, b) => b.used - a.used)[0];
  for (const o of orphans) {
    const s = snaps.filter((x) => x.time <= o.time && (x.snap.some((w) => w.resetsAt) || o.time - x.time < 5 * 3600_000)).pop();
    const w = s && full(s, o.time);
    // With nothing to go on (often a free account refused on its first request) the notice is still one this tool
    // knows, so it isn't counted as unread; there's just no limit window to report.
    if (w) hits.push({ time: o.time, ...w, plan: s.plan, version: o.version, snap: s.snap });
  }
  usage.sort((a, b) => a.time - b.time);
  hits.sort((a, b) => a.time - b.time);
  return { usage, hits, unread };
}

export function codexHits(data) {
  const { usage, hits } = data;
  const out = [];
  for (const h of hits) {
    const kind = windowKind(h.minutes);
    const start = h.resetsAt - h.minutes * 60_000;
    if (!kind || !h.resetsAt || !(start < h.time)) {
      data.unread?.push({ time: h.time, version: h.version });
      continue;
    }
    if (out.some((o) => o.window === kind && Math.abs(o.start - start) < 30 * 60_000)) continue;
    // How full the weekly limit was when a 5-hour limit ran out.
    const weekly = kind === '5h' ? h.snap?.find((w) => windowKind(w.minutes) === 'weekly') : null;
    out.push({
      lab: 'openai', product: 'codex', window: kind, start, hit: h.time, plan: h.plan, version: h.version,
      weekly_used: weekly ? Math.round(weekly.used) : null,
    });
  }
  return out.map((c) => ({ ...c, ...windowSummary(c, usage, (m) => (m ? String(m).toLowerCase().slice(0, 40) : null)) }));
}
