// What a usage report can contain, and how incoming reports are checked.
// The command-line tool in cli/ keeps its own copy of these lists; the server is the one that enforces them.

export const MIN_GROUP = 20; // reports needed before a group's numbers are shown
export const RECENT_DAYS = 30; // the results page only counts reports from this many days back

export const OPTIONS = {
  anthropic: {
    products: { 'claude-code': 'Claude Code', 'claude-app': 'Claude app' },
    plans: { free: 'Free', pro: 'Pro', 'max-5x': 'Max 5x', 'max-20x': 'Max 20x', team: 'Team', enterprise: 'Enterprise', other: 'Other' },
    models: ['opus', 'sonnet', 'haiku'],
  },
  openai: {
    products: { codex: 'Codex', 'codex-review': 'Codex code review', chatgpt: 'ChatGPT' },
    plans: { free: 'Free', go: 'Go', plus: 'Plus', 'pro-100': 'Pro 100', 'pro-200': 'Pro 200', 'pro-500': 'Pro 500', business: 'Business', enterprise: 'Enterprise', other: 'Other' },
    models: [],
  },
  google: {
    products: { 'gemini-cli': 'Gemini CLI', 'gemini-app': 'Gemini app' },
    plans: { free: 'Free', 'ai-plus': 'AI Plus', 'ai-pro': 'AI Pro', 'ai-ultra': 'AI Ultra', other: 'Other' },
    models: [],
  },
} as const;

export type Lab = keyof typeof OPTIONS;

// Length of each kind of limit window, in minutes.
// Monthly windows vary with the month's length, so they allow up to 31 days.
export const WINDOWS = { '5h': 300, daily: 1440, weekly: 10080, monthly: 44640 } as const;
export type LimitWindow = keyof typeof WINDOWS;

export const WORK = ['coding', 'chat', 'research', 'other'] as const;
// own = paid the lab directly (personal or work seat); shared = an account used by several people;
// reseller = bought through a third party. Shared and reseller reports are kept apart from the rest.
export const ACCOUNTS = ['own', 'shared', 'reseller'] as const;
// How the hit compared with what the person is used to. Optional.
export const FELT = ['sooner', 'usual', 'later'] as const;

export interface Report {
  lab: Lab;
  product: string;
  plan: string;
  window: LimitWindow;
  minutes_to_limit: number;
  hit_on: string;
  model: string | null;
  // Tokens per model in the window, from the command-line tool.
  models: Record<string, ModelTokens> | null;
  work: (typeof WORK)[number] | null;
  account: (typeof ACCOUNTS)[number];
  felt: (typeof FELT)[number] | null;
  tokens_total: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_cache_read: number | null;
  tokens_cache_write: number | null;
  // Part of output (Codex logs it separately).
  tokens_reasoning: number | null;
  // Model responses in the window, the UTC hour the window started, and for a 5-hour hit how full the weekly
  // limit was (0–100). All from the command-line tool.
  requests: number | null;
  start_hour: number | null;
  weekly_used: number | null;
  tool_version: string | null;
  source: 'form' | 'cli';
  client_id: string;
}

const MAX_TOKENS = 1e12;
const MODEL_FIELDS = ['total', 'input', 'output', 'cache_read', 'cache_write', 'reasoning'] as const;
type ModelTokens = Partial<Record<(typeof MODEL_FIELDS)[number], number>>;

function has<T extends object>(obj: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
}

function tokenCount(v: unknown, name: string): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_TOKENS) throw new Error(`${name} must be a whole number`);
  return n;
}

const MODEL = /^[a-z0-9][a-z0-9 ._-]{0,39}$/;

function modelBreakdown(v: unknown): Report['models'] {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('models must be an object');
  const entries = Object.entries(v as Record<string, any>);
  if (entries.length === 0) return null;
  if (entries.length > 8) throw new Error('models has too many entries');
  const out: Record<string, ModelTokens> = {};
  for (const [name, t] of entries) {
    const key = name.trim().toLowerCase();
    if (!MODEL.test(key)) throw new Error('models has an invalid model name');
    const m: ModelTokens = {};
    for (const f of MODEL_FIELDS) {
      const n = tokenCount(t?.[f], `models.${f}`);
      if (n !== null) m[f] = n;
    }
    out[key] = m;
  }
  return out;
}

function wholeNumber(v: unknown, name: string, max: number): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${name} must be a whole number from 0 to ${max}`);
  return n;
}

function shortText(v: unknown, name: string, pattern: RegExp): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (!pattern.test(s)) throw new Error(`${name} is not valid`);
  return s;
}

// Returns a clean report or throws an Error whose message is safe to show the sender.
export function parseReport(body: unknown, today = new Date()): Report {
  if (!body || typeof body !== 'object') throw new Error('Expected a JSON object');
  const b = body as Record<string, any>;

  if (!has(OPTIONS, b.lab)) throw new Error('lab is not valid');
  const lab = b.lab;
  const opts = OPTIONS[lab];
  if (!has(opts.products, b.product)) throw new Error('product is not valid for this lab');
  if (!has(opts.plans, b.plan)) throw new Error('plan is not valid for this lab');
  if (!has(WINDOWS, b.window)) throw new Error('window must be 5h, daily, weekly or monthly');
  const window = b.window;

  // Rounded to 5 minutes, as promised on the share page.
  const raw = Number(b.minutes_to_limit);
  if (!Number.isFinite(raw) || raw <= 0 || raw > WINDOWS[window]) {
    throw new Error(`minutes_to_limit must be between 1 and ${WINDOWS[window]}`);
  }
  const minutes = Math.min(WINDOWS[window], Math.max(5, Math.round(raw / 5) * 5));

  const hit = typeof b.hit_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.hit_on) ? new Date(`${b.hit_on}T00:00:00Z`) : null;
  const ageDays = hit ? (today.getTime() - hit.getTime()) / 86400000 : NaN;
  if (!hit || Number.isNaN(hit.getTime()) || ageDays < -1 || ageDays > 60) {
    throw new Error('hit_on must be a date (YYYY-MM-DD) within the last 60 days');
  }

  const work = b.work ?? null;
  if (work !== null && !WORK.includes(work)) throw new Error('work must be coding, chat, research or other');
  const account = b.account ?? 'own';
  if (!ACCOUNTS.includes(account)) throw new Error('account must be own, shared or reseller');
  const felt = b.felt ?? null;
  if (felt !== null && !FELT.includes(felt)) throw new Error('felt must be sooner, usual or later');

  const tokens = b.tokens && typeof b.tokens === 'object' ? b.tokens : {};
  const client = typeof b.client_id === 'string' ? b.client_id : '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(client)) throw new Error('client_id is missing');

  return {
    lab,
    product: b.product,
    plan: b.plan,
    window,
    minutes_to_limit: minutes,
    hit_on: b.hit_on,
    model: shortText(b.model, 'model', MODEL),
    models: modelBreakdown(b.models),
    work,
    account,
    felt,
    tokens_total: tokenCount(tokens.total ?? b.tokens_total, 'tokens.total'),
    tokens_input: tokenCount(tokens.input, 'tokens.input'),
    tokens_output: tokenCount(tokens.output, 'tokens.output'),
    tokens_cache_read: tokenCount(tokens.cache_read, 'tokens.cache_read'),
    tokens_cache_write: tokenCount(tokens.cache_write, 'tokens.cache_write'),
    tokens_reasoning: tokenCount(tokens.reasoning, 'tokens.reasoning'),
    requests: wholeNumber(b.requests, 'requests', 1_000_000),
    start_hour: wholeNumber(b.start_hour, 'start_hour', 23),
    weekly_used: window === '5h' ? wholeNumber(b.weekly_used, 'weekly_used', 100) : null,
    tool_version: shortText(b.tool_version, 'tool_version', /^[a-z0-9][a-z0-9 ._+-]{0,39}$/),
    source: b.source === 'cli' ? 'cli' : 'form',
    client_id: client,
  };
}

export function labelFor(lab: string, kind: 'products' | 'plans', key: string): string {
  if (!has(OPTIONS, lab)) return key;
  const list = OPTIONS[lab][kind] as Record<string, string>;
  return list[key] ?? key;
}
