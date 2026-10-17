// Data behind the home page: median minutes from window start to the 5-hour limit, per plan and week.
export interface PlanTrend {
  lab: string;
  plan: string;
  // Reports in the period; plans under MIN_GROUP are shown as pending.
  reports: number;
  // One median per week (oldest first), null for weeks with too few reports.
  minutes: (number | null)[];
}

export interface HomeData {
  sample?: boolean;
  days: number;
  reports: number;
  people: number;
  weeks: string[];
  plans: PlanTrend[];
}
