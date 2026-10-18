// The quick questions for limits that leave no logs on this computer (claude.ai, ChatGPT, Gemini, cloud agents).
import { createInterface } from 'node:readline/promises';
import { parseReset } from './time.js';

export const APPS = [
  ['claude-app', 'Claude (claude.ai or the app)', 'anthropic'],
  ['claude-code', 'Claude Code', 'anthropic'],
  ['chatgpt', 'ChatGPT', 'openai'],
  ['codex', 'Codex', 'openai'],
  ['gemini-app', 'Gemini (gemini.google.com or the app)', 'google'],
  ['gemini-cli', 'Gemini CLI', 'google'],
];

export const WINDOW_MINUTES = { '5h': 300, daily: 1440, weekly: 10080, monthly: 44640 };
const WINDOWS_BY_LAB = {
  anthropic: [['5h', '5-hour limit'], ['weekly', 'weekly limit']],
  openai: [['5h', '5-hour limit'], ['weekly', 'weekly limit']],
  google: [['daily', 'daily limit'], ['5h', '5-hour limit'], ['weekly', 'weekly limit'], ['monthly', 'monthly limit']],
};
export const windowsFor = (lab) => WINDOWS_BY_LAB[lab];

// Reads "3pm", "15:40", "Thu 9am", "Oct 20, 9am", "in 2h 10m", or a pasted limit message, and returns the moment.
export function parseWhen(text, now = new Date()) {
  const s = String(text).trim();
  const rel = /\bin\s+(?:(\d+)\s*(?:h|hr|hrs|hours?))?\s*(?:(\d+)\s*(?:m|min|mins|minutes?))?/i.exec(s);
  if (rel && (rel[1] || rel[2])) return new Date(now.getTime() + ((Number(rel[1] ?? 0) * 60) + Number(rel[2] ?? 0)) * 60_000);
  // A weekday name means the next one at that time.
  const day = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?,?\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i.exec(s);
  if (day) {
    const t = parseReset(`resets ${day[2]}`, now);
    if (!t) return null;
    const want = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(day[1].toLowerCase());
    while (t.getDay() !== want) t.setDate(t.getDate() + 1);
    return t;
  }
  return parseReset(/resets?\b/i.test(s) ? s : `resets ${s.replace(/^(?:at|on)\s+/i, '')}`, now);
}

// Same as parseWhen, for a time that already happened today ("2:30pm" means today, not tomorrow).
export function parsePast(text, now = new Date()) {
  const s = String(text).trim();
  const ago = /(?:(\d+)\s*(?:h|hr|hrs|hours?))?\s*(?:(\d+)\s*(?:m|min|mins|minutes?))?\s+ago/i.exec(s);
  if (ago && (ago[1] || ago[2])) return new Date(now.getTime() - ((Number(ago[1] ?? 0) * 60) + Number(ago[2] ?? 0)) * 60_000);
  const t = parseReset(`resets ${s.replace(/^(?:at|on)\s+/i, '')}`, new Date(now.getTime() - 24 * 3600_000));
  return t && t.getTime() <= now.getTime() + 60_000 ? t : null;
}

export async function askText(question, { input = process.stdin, output = process.stdout } = {}) {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(`${question} `)).trim();
  } finally {
    rl.close();
  }
}

// A hit in the shape the log readers produce, from when the limit ran out and when it resets.
export function manualHit({ product, lab, window, plan, hit, resets }) {
  const start = resets.getTime() - WINDOW_MINUTES[window] * 60_000;
  if (!(hit.getTime() > start && hit.getTime() <= resets.getTime())) return null;
  return { lab, product, window, plan, start, hit: hit.getTime(), tokens: null, model: null, models: null, tool_version: null, source: 'manual' };
}
