// What the menu bar app shows: how full each limit is now, the recent limit hits, and how the tokens you got
// before a limit compare with your earlier hits. Built from the same log reads as the report flow.
import { fiveHourWindows, modelFamily } from './claude.js';
import { codexModel, windowKind } from './codex.js';
import { modelBreakdown } from './models.js';
import { hitKey } from './state.js';
import { DAY, HOUR } from './time.js';

const total = (u) => u.input + u.output + u.cacheRead + (u.cacheWrite ?? 0);

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Claude Code's logs have no percentages, so "how full" is the tokens used in the open 5-hour window next to the
// tokens you had used when you hit the limit before. Claude app use counts too and isn't in these logs.
export function claudeNow(claude, hits, now) {
  if (!claude.usage.length) return null;
  const start = fiveHourWindows(claude.usage).at(-1);
  const open = now < start + 5 * HOUR;
  const inWindow = open ? claude.usage.filter((u) => u.time >= start && u.time <= now) : [];
  const past = hits.filter((h) => h.window === '5h' && h.tokens && h.hit < start);
  const blocked = hits.filter((h) => h.start + (h.window === 'weekly' ? 7 * DAY : 5 * HOUR) > now).at(-1);
  return {
    window: open
      ? {
          start,
          resets_at: start + 5 * HOUR,
          tokens: inWindow.reduce((n, u) => n + total(u), 0),
          requests: inWindow.length,
          typical_at_limit: median(past.map((h) => h.tokens.total)),
          past_hits: past.length,
          models: modelBreakdown(inWindow, modelFamily).models,
        }
      : null,
    limited_until: blocked ? blocked.start + (blocked.window === 'weekly' ? 7 * DAY : 5 * HOUR) : null,
    week_tokens: claude.usage.filter((u) => u.time > now - 7 * DAY).reduce((n, u) => n + total(u), 0),
    last_used: claude.usage.at(-1).time,
  };
}

// Codex logs how full each window is. A window whose reset time has passed is empty again.
export function codexNow(codex, now) {
  const l = codex.latest;
  if (!l) return null;
  // Tokens per model in the open 5-hour window, counted from the window's start (its reset time less 5 hours).
  const five = l.snap.find((w) => windowKind(w.minutes) === '5h' && w.resetsAt > now);
  const since = five ? five.resetsAt - five.minutes * 60_000 : null;
  return {
    as_of: l.time,
    plan: l.plan,
    window_start: since,
    models: since === null ? null : modelBreakdown(codex.usage.filter((u) => u.time >= since && u.time <= now), codexModel).models,
    limits: l.snap
      .map((w) => {
        const reset = w.resetsAt && w.resetsAt <= now;
        return { window: windowKind(w.minutes), used: reset ? 0 : Math.round(w.used), resets_at: reset ? null : w.resetsAt };
      })
      .filter((w) => w.window),
  };
}

// Per lab and window: hits in the last 7 days next to the ones before. Fewer tokens before the limit for the
// same kind of use is what a quiet cut looks like.
export function trend(hits, now) {
  const groups = {};
  for (const h of hits) if (h.tokens) (groups[`${h.lab}:${h.window}`] ??= []).push(h);
  const sum = (list) => ({
    n: list.length,
    tokens: median(list.map((h) => h.tokens.total)),
    minutes: median(list.map((h) => Math.round((h.hit - h.start) / 60000))),
  });
  return Object.entries(groups)
    .map(([k, list]) => {
      const [lab, window] = k.split(':');
      const recent = list.filter((h) => h.hit >= now - 7 * DAY);
      const earlier = list.filter((h) => h.hit < now - 7 * DAY);
      return { lab, window, recent: sum(recent), earlier: sum(earlier) };
    })
    .filter((t) => t.recent.n && t.earlier.n);
}

export function status({ claude, codex, claudeFound, codexFound, state, now = Date.now() }) {
  const found = [...claudeFound, ...codexFound].sort((a, b) => b.hit - a.hit);
  return {
    generated_at: now,
    claude: claudeNow(claude, claudeFound, now),
    codex: codexNow(codex, now),
    hits: found.map((c) => ({
      key: hitKey(c),
      lab: c.lab,
      product: c.product,
      window: c.window,
      start: c.start,
      hit: c.hit,
      tokens: c.tokens?.total ?? null,
      // Tokens per model, as in the report this hit would send.
      models: c.models ?? null,
      requests: c.requests ?? null,
      plan: c.plan,
      sent: state.sent.includes(hitKey(c)),
    })),
    trend: trend(found, now),
    plans: state.plans,
    unread: { claude: claude.unread.length, codex: codex.unread.length },
  };
}
