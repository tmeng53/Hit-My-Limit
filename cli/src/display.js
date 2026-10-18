// How a limit hit is shown in the terminal before anything is sent.
import { PLANS, PRODUCT_NAMES, WINDOW_NAMES } from './options.js';
import { duration, isoDay } from './time.js';

export function colors(enabled) {
  const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  return { bold: wrap(1), dim: wrap(2), green: wrap(32) };
}

export const shortTokens = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);

const pct = (part, whole) => (whole ? Math.round((100 * part) / whole) : 0);

export function hitLines(c, i, { sent = false, c: k = colors(false) } = {}) {
  const pad = '     ';
  const head = [
    String(i + 1).padStart(3),
    isoDay(new Date(c.hit)),
    k.bold(`${PRODUCT_NAMES[c.product]}, ${WINDOW_NAMES[c.window]} limit`),
    sent ? k.dim('already sent') : k.green('new'),
  ];
  const lines = [head.join('  ')];
  const startHour = String(new Date(c.start).getUTCHours()).padStart(2, '0');
  lines.push(`${pad}Ran out ${duration((c.hit - c.start) / 60000)} after the window started ${k.dim(`(${startHour}:00 UTC)`)}`);
  const t = c.tokens;
  if (t) {
    const parts = [`${shortTokens(t.total)} tokens`];
    if (c.requests) parts.push(`${c.requests} requests`);
    const cached = pct(t.cache_read, t.total);
    if (cached) parts.push(`${cached}% read from cache`);
    lines.push(pad + parts.join(', '));
  }
  const models = Object.entries(c.models ?? {}).sort((a, b) => b[1].total - a[1].total);
  if (t && models.length > 1) {
    const width = Math.max(...models.slice(0, 3).map(([m]) => m.length));
    for (const [m, v] of models.slice(0, 3)) {
      lines.push(`${pad}${k.dim(m.padEnd(width))}  ${shortTokens(v.total).padStart(6)}  ${k.dim(`${String(pct(v.total, t.total)).padStart(3)}%`)}`);
    }
    if (models.length > 3) lines.push(`${pad}${k.dim(`and ${models.length - 3} more`)}`);
  } else if (c.model) {
    lines.push(`${pad}${k.dim('model')} ${c.model}`);
  }
  const extra = [];
  if (c.plan) extra.push(`plan ${PLANS[c.lab].find(([key]) => key === c.plan)?.[1] ?? c.plan} (from ${c.source === 'login' ? 'your login' : 'the logs'})`);
  if (c.weekly_used !== null && c.weekly_used !== undefined) extra.push(`weekly limit ${c.weekly_used}% used`);
  if (extra.length) lines.push(pad + k.dim(extra.join(', ')));
  return lines;
}

const ISSUES = 'https://github.com/tmeng53/Hit-My-Limit/issues/new';

// A note about limit notices that couldn't be read, with a link to report it. The link carries only counts and
// version numbers, never log content.
export function unreadNote(sources, k = colors(false)) {
  const parts = [];
  const versions = [];
  for (const [name, list] of sources) {
    // A refused request is often retried many times; count each hour once.
    const n = new Set(list.map((u) => Math.floor(u.time / 3_600_000))).size;
    if (!n) continue;
    parts.push(`${n} in ${name}`);
    const v = [...new Set(list.map((u) => u.version).filter(Boolean))].slice(-3);
    versions.push(`${name} ${v.join(', ') || 'unknown'}`);
  }
  if (!parts.length) return null;
  const title = encodeURIComponent('Limit notices the tool could not read');
  const body = encodeURIComponent(`Unread: ${parts.join(', ')}\nVersions: ${versions.join('; ')}`);
  return [
    `Some limit notices couldn't be read (${parts.join(', ')}). The log format may have changed,`,
    'so these hits are missing above. Letting us know helps fix it for everyone:',
    k.dim(`${ISSUES}?title=${title}&body=${body}`),
  ].join('\n');
}
