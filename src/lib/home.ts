// Data behind the home page: median API-price value (US dollars) used before the 5-hour limit, per plan and week.
export interface PlanTrend {
  lab: string;
  plan: string;
  // Reports with token counts in the period; plans under MIN_GROUP are shown as pending.
  reports: number;
  // One median per week (oldest first), null for weeks with too few reports.
  usd: (number | null)[];
}

export interface HomeData {
  sample?: boolean;
  days: number;
  reports: number;
  people: number;
  weeks: string[];
  plans: PlanTrend[];
}

// What the home page shows before there is a database or any report.
export function emptyHome(): HomeData {
  return { days: 30, reports: 0, people: 0, weeks: [], plans: [] };
}
