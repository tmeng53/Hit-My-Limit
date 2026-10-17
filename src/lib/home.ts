// Data behind the home page. Minutes are from window start to the limit; `prev` is the median for the
// period before, used to show whether people now run out sooner or later.
export interface PlanRow {
  lab: string;
  plan: string;
  window: string;
  reports: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  prev: number | null;
  tokens: number | null;
  sooner: number | null;
}

export interface HomeData {
  sample?: boolean;
  days: number;
  reports: number;
  people: number;
  plans: PlanRow[];
  // Share of tokens per model, in percent, by lab.
  models: { lab: string; shares: [string, number][] }[];
  // Share of reports per week that said the limit came sooner than usual.
  sooner: { week: string; pct: number; n: number }[];
}
