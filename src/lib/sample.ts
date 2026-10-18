// Made-up numbers in the shape of the home page data, used to design the page before there are real reports.
import type { GroupStats } from './db';
import type { HomeData } from './home';

export const SAMPLE: HomeData = {
  sample: true,
  days: 30,
  reports: 1284,
  people: 412,
  weeks: ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'],
  plans: [
    { lab: 'anthropic', plan: 'pro', reports: 214, usd: [7.8, 7.7, 7.9, 7.6, 7.6, 7.2, 6.9, 6.4, 6.3, 6.2, 6.1, 6.1] },
    { lab: 'anthropic', plan: 'max-5x', reports: 187, usd: [38, 38, 39, 37, 37, 36, 35, 34, 33, 33, 33, 33] },
    { lab: 'anthropic', plan: 'max-20x', reports: 96, usd: [148, 150, 147, 149, 151, 150, 152, 150, 151, 150, 151, 151] },
    { lab: 'openai', plan: 'plus', reports: 233, usd: [9.4, 9.3, 9.5, 9.3, 9.2, 9.0, 9.1, 8.9, 8.8, 8.8, 8.9, 8.8] },
    { lab: 'openai', plan: 'pro-200', reports: 64, usd: [122, 124, 121, 123, 120, 125, 122, 124, 123, 126, 125, 127] },
    { lab: 'google', plan: 'ai-pro', reports: 12, usd: [null, null, null, null, null, null, null, null, null, null, null, null] },
  ],
};

// Made-up groups in the shape of the limits page data, for the same purpose.
export const SAMPLE_GROUPS: GroupStats[] = [
  { lab: 'anthropic', plan: 'pro', window: '5h', account: 'own', reports: 214, contributors: 90, token_reports: 160, median_usd: 6.1, p25_usd: 4.4, p75_usd: 8.3, prev_median_usd: 7.8, median_tokens: 9_400_000, median_minutes: 95, felt_reports: 120, felt_sooner: 41 },
  { lab: 'anthropic', plan: 'pro', window: 'weekly', account: 'own', reports: 61, contributors: 44, token_reports: 48, median_usd: 41, p25_usd: 30, p75_usd: 55, prev_median_usd: null, median_tokens: 66_000_000, median_minutes: 5880, felt_reports: 30, felt_sooner: 52 },
  { lab: 'anthropic', plan: 'max-5x', window: '5h', account: 'own', reports: 187, contributors: 71, token_reports: 150, median_usd: 33, p25_usd: 24, p75_usd: 45, prev_median_usd: 38, median_tokens: 48_000_000, median_minutes: 160, felt_reports: 90, felt_sooner: 33 },
  { lab: 'anthropic', plan: 'max-20x', window: '5h', account: 'own', reports: 96, contributors: 30, token_reports: 80, median_usd: 151, p25_usd: 112, p75_usd: 190, prev_median_usd: 148, median_tokens: 210_000_000, median_minutes: 230, felt_reports: 40, felt_sooner: 12 },
  { lab: 'openai', plan: 'plus', window: '5h', account: 'own', reports: 233, contributors: 101, token_reports: 190, median_usd: 8.8, p25_usd: 6.5, p75_usd: 11.9, prev_median_usd: 9.4, median_tokens: 14_000_000, median_minutes: 70, felt_reports: 110, felt_sooner: 22 },
  { lab: 'openai', plan: 'pro-200', window: '5h', account: 'own', reports: 64, contributors: 25, token_reports: 52, median_usd: 127, p25_usd: 96, p75_usd: 160, prev_median_usd: 122, median_tokens: 180_000_000, median_minutes: 210, felt_reports: 25, felt_sooner: 8 },
  { lab: 'google', plan: 'ai-pro', window: 'daily', account: 'own', reports: 12, contributors: 9, token_reports: 0, median_usd: null, p25_usd: null, p75_usd: null, prev_median_usd: null, median_tokens: null, median_minutes: null, felt_reports: 4, felt_sooner: null },
  { lab: 'anthropic', plan: 'pro', window: '5h', account: 'other', reports: 23, contributors: 6, token_reports: 21, median_usd: 2.9, p25_usd: 1.8, p75_usd: 4.0, prev_median_usd: null, median_tokens: 4_100_000, median_minutes: 40, felt_reports: 5, felt_sooner: null },
];
