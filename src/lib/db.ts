import { createHash } from 'node:crypto';
import pg from 'pg';
import { BIN_MINUTES, MIN_GROUP, RECENT_DAYS, WINDOWS, type Report } from './reports';

// Vercel's Neon and Supabase integrations set one of these.
const URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const PER_IP_PER_DAY = 20;

// Keep dates as 'YYYY-MM-DD' strings instead of local-time Date objects.
pg.types.setTypeParser(1082, (v) => v);

const SCHEMA = `
create table if not exists reports (
  id bigserial primary key,
  created_on date not null default current_date,
  hit_on date not null,
  lab text not null,
  product text not null,
  plan text not null,
  limit_window text not null,
  minutes_to_limit integer not null,
  model text,
  models jsonb,
  work text,
  account text not null,
  felt text,
  tokens_total bigint,
  tokens_input bigint,
  tokens_output bigint,
  tokens_cache_read bigint,
  tokens_cache_write bigint,
  tokens_reasoning bigint,
  requests integer,
  start_hour smallint,
  weekly_used smallint,
  tool_version text,
  source text not null,
  contributor text not null,
  hidden boolean not null default false,
  unique (contributor, lab, limit_window, hit_on, minutes_to_limit)
);
-- Columns added after the first version of the table.
alter table reports add column if not exists tokens_reasoning bigint;
alter table reports add column if not exists requests integer;
alter table reports add column if not exists start_hour smallint;
alter table reports add column if not exists weekly_used smallint;
alter table reports alter column work drop not null;
create index if not exists reports_group on reports (lab, plan, limit_window, hit_on);
-- Daily submission counts per hashed IP address, used only for rate limiting. Rows older than today are deleted.
create table if not exists submit_counts (
  key text primary key,
  day date not null,
  n integer not null
);
`;

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

export function dbConfigured() {
  return URL !== '';
}

async function db() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: URL, max: 1 });
    ready = pool.query(SCHEMA).then(() => undefined);
    ready.catch(() => {
      ready = null;
      pool = null;
    });
  }
  await ready;
  return pool!;
}

export function sha(text: string, len = 16) {
  return createHash('sha256').update(text).digest('hex').slice(0, len);
}

// Returns false once an address has sent PER_IP_PER_DAY reports today. The address is hashed with a secret
// (the database URL) and the day, so stored keys can't be turned back into addresses.
export async function allowSubmit(ip: string): Promise<boolean> {
  const p = await db();
  const today = new Date().toISOString().slice(0, 10);
  const key = sha(`${URL}|${today}|${ip}`, 32);
  await p.query('delete from submit_counts where day < current_date');
  const { rows } = await p.query(
    `insert into submit_counts (key, day, n) values ($1, current_date, 1)
     on conflict (key) do update set n = submit_counts.n + 1
     returning n`,
    [key],
  );
  return rows[0].n <= PER_IP_PER_DAY;
}

// Inserts the report. Returns false if the same contributor already sent the same report.
export async function saveReport(r: Report): Promise<boolean> {
  const p = await db();
  const { rowCount } = await p.query(
    `insert into reports (hit_on, lab, product, plan, limit_window, minutes_to_limit, model, work, account,
       tokens_total, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tool_version, source, contributor, felt, models,
       tokens_reasoning, requests, start_hour, weekly_used)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     on conflict do nothing`,
    [
      r.hit_on, r.lab, r.product, r.plan, r.window, r.minutes_to_limit, r.model, r.work, r.account,
      r.tokens_total, r.tokens_input, r.tokens_output, r.tokens_cache_read, r.tokens_cache_write,
      r.tool_version, r.source, sha(r.client_id), r.felt,
      r.models && JSON.stringify(r.models),
      r.tokens_reasoning, r.requests, r.start_hour, r.weekly_used,
    ],
  );
  return rowCount === 1;
}

export interface Comparison {
  // Share of other recent reports in the group that lasted longer before hitting the limit, 0–100.
  percent: number | null;
  // How many recent reports the comparison is based on, and whether it is narrowed to the same kind of work.
  n: number;
  sameWork: boolean;
  // For groups of at least MIN_GROUP: the group's median minutes to the limit, and report counts per bin of
  // bin_minutes from 0 up to the window length.
  median_minutes?: number;
  bin_minutes?: number;
  bins?: number[];
}

// How this report compares with others on the same plan and limit, preferring the same kind of work.
export async function compare(r: Report): Promise<Comparison> {
  const p = await db();
  const run = async (sameWork: boolean) => {
    const { rows } = await p.query(
      `select count(*)::int as n,
              count(*) filter (where minutes_to_limit > $5)::int as longer,
              percentile_cont(0.5) within group (order by minutes_to_limit) as median,
              array_agg(minutes_to_limit) as minutes
       from reports
       where not hidden and account = 'own' and lab = $1 and plan = $2 and limit_window = $3
         and hit_on > current_date - $4::int and contributor <> $6
         ${sameWork ? 'and work = $7' : ''}`,
      [r.lab, r.plan, r.window, RECENT_DAYS, r.minutes_to_limit, sha(r.client_id), ...(sameWork ? [r.work] : [])],
    );
    return rows[0] as { n: number; longer: number; median: number | null; minutes: number[] | null };
  };
  for (const sameWork of r.work ? [true, false] : [false]) {
    const { n, longer, median, minutes } = await run(sameWork);
    if (n >= MIN_GROUP) {
      const bin = BIN_MINUTES[r.window];
      const bins = new Array<number>(Math.ceil(WINDOWS[r.window] / bin)).fill(0);
      for (const m of minutes ?? []) bins[Math.min(bins.length - 1, Math.floor(m / bin))]++;
      return { percent: Math.round((100 * longer) / n), n, sameWork, median_minutes: Math.round(median!), bin_minutes: bin, bins };
    }
  }
  const { n } = await run(false);
  return { percent: null, n, sameWork: false };
}

export interface GroupStats {
  lab: string;
  plan: string;
  window: string;
  account: string;
  reports: number;
  contributors: number;
  median_minutes: number | null;
  token_reports: number;
  median_tokens: number | null;
  // Of the reports that answered, the share that said the limit came sooner than usual, 0–100.
  felt_reports: number;
  felt_sooner: number | null;
}

// Per-group counts and medians over the last RECENT_DAYS days. Medians are left out for small groups.
export async function groupStats(): Promise<GroupStats[]> {
  const p = await db();
  const { rows } = await p.query(
    `select lab, plan, limit_window as window, case when account = 'own' then 'own' else 'other' end as account,
            count(*)::int as reports,
            count(distinct contributor)::int as contributors,
            percentile_cont(0.5) within group (order by minutes_to_limit) as median_minutes,
            count(tokens_total)::int as token_reports,
            percentile_cont(0.5) within group (order by tokens_total) as median_tokens,
            count(felt)::int as felt_reports,
            count(*) filter (where felt = 'sooner')::int as sooner
     from reports
     where not hidden and hit_on > current_date - $1::int
     group by 1, 2, 3, 4
     order by 1, 2, 3, 4`,
    [RECENT_DAYS],
  );
  return rows.map((g) => ({
    ...g,
    median_minutes: g.reports >= MIN_GROUP ? Math.round(g.median_minutes) : null,
    median_tokens: g.token_reports >= MIN_GROUP ? Math.round(g.median_tokens) : null,
    felt_sooner: g.felt_reports >= MIN_GROUP ? Math.round((100 * g.sooner) / g.felt_reports) : null,
  }));
}

export const CSV_COLUMNS = [
  'id', 'hit_on', 'lab', 'product', 'plan', 'limit_window', 'minutes_to_limit', 'model', 'work', 'account',
  'tokens_total', 'tokens_input', 'tokens_output', 'tokens_cache_read', 'tokens_cache_write',
  'tool_version', 'source', 'contributor', 'felt', 'models',
  'tokens_reasoning', 'requests', 'start_hour', 'weekly_used',
] as const;

// Every visible report, for the public dataset.
export async function allReports() {
  const p = await db();
  const { rows } = await p.query(
    `select ${CSV_COLUMNS.join(', ')} from reports where not hidden order by id`,
  );
  return rows;
}
