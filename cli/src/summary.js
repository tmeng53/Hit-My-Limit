// What the Claude Code hook says after it sends a report: how long the limit lasted, how that compares, and
// which models used it up.
import { PLANS, WINDOW_NAMES } from './options.js';
import { duration } from './time.js';

const WEEK = 7 * 24 * 3600_000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINAL = ['', '1st', '2nd', '3rd'];
const minutes = (h) => (h.hit - h.start) / 60_000;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function planName(lab, plan) {
  return PLANS[lab]?.find(([k]) => k === plan)?.[1] ?? plan;
}

// "Opus 78% · Sonnet 22%", biggest first, at most three.
export function modelMix(models) {
  const list = Object.entries(models ?? {}).filter(([, v]) => v?.total > 0).sort((a, b) => b[1].total - a[1].total);
  const total = list.reduce((n, [, v]) => n + v.total, 0);
  if (!total) return '';
  if (list.length === 1) return `All ${cap(list[0][0])}`;
  return list.slice(0, 3).map(([m, v]) => `${cap(m)} ${Math.round((100 * v.total) / total)}%`).join(' · ');
}

// Compared with the person's own hits of the same limit in the past week: "2nd time this week, 40m sooner than Tue".
export function ownHistory(hit, hits) {
  const before = hits
    .filter((h) => h.window === hit.window && h.hit < hit.hit && h.hit > hit.hit - WEEK && Math.abs(h.start - hit.start) > 30 * 60_000)
    .sort((a, b) => a.hit - b.hit);
  if (!before.length) return 'First time this week';
  const n = before.length + 1;
  const prev = before[before.length - 1];
  const day = DAYS[new Date(prev.hit).getDay()];
  const diff = minutes(prev) - minutes(hit);
  const times = `${ORDINAL[n] ?? `${n}th`} time this week`;
  if (Math.abs(diff) < 10) return `${times}, about the same as ${day}`;
  return `${times}, ${duration(Math.abs(diff))} ${diff > 0 ? 'sooner' : 'later'} than ${day}`;
}

// The notification: a title, the comparison (or the person's own history until a plan has enough reports),
// and the model mix.
export function hookSummary(hit, plan, comparison, hits) {
  const name = planName(hit.lab, plan);
  const title = `Claude ${name}: ${WINDOW_NAMES[hit.window]} limit out after ${duration(minutes(hit))}`;
  const line = comparison && comparison.percent !== null
    ? `Sooner than ${comparison.percent}% of ${name} reports`
    : ownHistory(hit, hits);
  return { title, line, models: modelMix(hit.models) };
}

// Whether a hit is far off the person's usual for that limit (half or double the median of their other hits), a
// hint that their plan changed. Tokens when both sides have them, else time to the limit.
export function unusual(hit, hits) {
  const others = hits.filter((h) => h !== hit && h.lab === hit.lab && h.window === hit.window
    && Math.abs(h.start - hit.start) > 30 * 60_000);
  const size = (h) => (hit.tokens?.total && h.tokens?.total ? h.tokens.total : hit.tokens?.total ? null : minutes(h));
  const values = others.map(size).filter((v) => v > 0).sort((a, b) => a - b);
  if (values.length < 2) return null;
  const median = values[Math.floor(values.length / 2)];
  const ratio = size(hit) / median;
  return ratio >= 2 ? 'more' : ratio <= 0.5 ? 'less' : null;
}
