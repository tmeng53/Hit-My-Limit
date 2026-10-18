// Live usage from Anthropic and OpenAI, read with the login Claude Code and Codex saved on this computer.
// Only used when the person picks it. The login is sent to Anthropic or OpenAI and nowhere else; it is never
// printed, saved or refreshed here.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const HOUR = 3600_000;
const WINDOW_MS = { '5h': 5 * HOUR, weekly: 7 * 24 * HOUR };

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

// Claude Code keeps its login in the macOS Keychain, and in ~/.claude/.credentials.json elsewhere.
export async function claudeLogin(env = process.env, platform = process.platform) {
  let creds = null;
  if (platform === 'darwin') {
    try {
      const { stdout } = await promisify(execFile)('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 30_000 });
      creds = JSON.parse(stdout);
    } catch {}
  }
  creds ??= await readJson(join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), '.credentials.json'));
  const o = creds?.claudeAiOauth;
  if (!o?.accessToken) return null;
  return { token: o.accessToken, plan: claudePlan(o.subscriptionType, o.rateLimitTier) };
}

export function claudePlan(subscription = '', tier = '') {
  if (/max_20x/i.test(tier)) return 'max-20x';
  if (/max_5x/i.test(tier)) return 'max-5x';
  return { free: 'free', pro: 'pro', team: 'team', enterprise: 'enterprise' }[String(subscription).toLowerCase()] ?? null;
}

export async function codexLogin(env = process.env) {
  const auth = await readJson(join(env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json'));
  const t = auth?.tokens;
  if (!t?.access_token) return null;
  return { token: t.access_token, account: t.account_id ?? null };
}

// Pro on ChatGPT comes in several sizes, so it is asked rather than guessed.
export function codexPlan(type = '') {
  return { free: 'free', go: 'go', plus: 'plus', team: 'business', business: 'business', enterprise: 'enterprise', edu: 'enterprise' }[String(type).toLowerCase()] ?? null;
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'hitmylimit-cli', ...headers }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) throw new Error('login expired');
  if (res.status === 429) throw new Error('too many checks, try again in a minute');
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const pct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// Each window: how full it is and when it resets. `start` is worked out from the reset time.
function window(key, used, resets) {
  if (!resets || Number.isNaN(resets.getTime())) return null;
  return { window: key, used: pct(used), resets, start: new Date(resets.getTime() - WINDOW_MS[key]) };
}

export function claudeWindows(body) {
  return [
    body?.five_hour && window('5h', body.five_hour.utilization, new Date(body.five_hour.resets_at)),
    body?.seven_day && window('weekly', body.seven_day.utilization, new Date(body.seven_day.resets_at)),
  ].filter(Boolean);
}

export function codexWindows(body) {
  const r = body?.rate_limit ?? {};
  return [r.primary_window, r.secondary_window]
    .filter((w) => w && w.reset_at)
    .map((w) => {
      const key = w.limit_window_seconds >= 6 * 24 * 3600 ? 'weekly' : '5h';
      // A plan with one weekly window reports it as the primary one.
      const full = r.limit_reached && (w === r.primary_window || !r.primary_window) ? 100 : w.used_percent;
      return window(key, full, new Date(w.reset_at * 1000));
    })
    .filter(Boolean);
}

export async function claudeUsage(login) {
  const body = await getJson('https://api.anthropic.com/api/oauth/usage', {
    authorization: `Bearer ${login.token}`,
    'anthropic-beta': 'oauth-2025-04-20',
  });
  return { lab: 'anthropic', product: 'claude-code', name: 'Claude', plan: login.plan, windows: claudeWindows(body) };
}

export async function codexUsage(login) {
  const body = await getJson('https://chatgpt.com/backend-api/wham/usage', {
    authorization: `Bearer ${login.token}`,
    ...(login.account ? { 'chatgpt-account-id': login.account } : {}),
  });
  return { lab: 'openai', product: 'codex', name: 'ChatGPT / Codex', plan: codexPlan(body?.plan_type), windows: codexWindows(body) };
}

// Turns a full window into a hit, in the same shape the log readers produce.
export function usageHits(u, now = Date.now()) {
  return u.windows
    .filter((w) => w.used >= 100)
    .map((w) => ({
      lab: u.lab, product: u.product, window: w.window, plan: u.plan,
      start: w.start.getTime(), hit: Math.min(now, w.resets.getTime()),
      tokens: null, model: null, models: null, tool_version: null, source: 'login',
    }));
}
